"use server";

import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { revalidatePath } from "next/cache";
import { caldavConnect, type CalDAVCredentials } from "@/lib/calendar/caldav";
import { revokeGoogleConnection, listGoogleCalendars } from "@/lib/calendar/google";
import { syncConnection } from "@/lib/calendar/sync";
import { PROVIDERS, type ProviderId } from "@/lib/calendar/providers";

export async function connectCalDAV(provider: ProviderId, input: {
  serverUrl?: string;
  username: string;
  password: string;
  selectedCalendarUrl?: string;
}): Promise<{ ok: true; calendars?: Array<{ url: string; displayName: string; timezone: string | null }> } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const config = PROVIDERS[provider];
  if (!config || config.kind !== "caldav") return { ok: false, error: "Ungültiger Provider" };

  const serverUrl = config.caldavUrl ?? input.serverUrl;
  if (!serverUrl) return { ok: false, error: "Server-URL fehlt" };

  const creds: CalDAVCredentials = {
    serverUrl,
    username: input.username,
    password: input.password,
  };

  try {
    const { calendars } = await caldavConnect(creds);
    if (calendars.length === 0) return { ok: false, error: "Keine Kalender gefunden" };

    // Wenn der User noch keinen Kalender ausgewählt hat, kommen die Optionen zurück
    if (!input.selectedCalendarUrl) {
      // Wenn es nur einen Kalender gibt: automatisch wählen
      if (calendars.length === 1) {
        await persistCalDAV(userId, provider, creds, calendars[0]);
        return { ok: true };
      }
      return { ok: true, calendars };
    }

    const chosen = calendars.find((c) => c.url === input.selectedCalendarUrl) ?? calendars[0];
    await persistCalDAV(userId, provider, creds, chosen);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: friendlyCaldavError(err?.message ?? "Verbindung fehlgeschlagen") };
  }
}

async function persistCalDAV(
  userId: string,
  provider: ProviderId,
  creds: CalDAVCredentials,
  calendar: { url: string; displayName: string; timezone: string | null },
) {
  await prisma.calendarConnection.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      accountEmail: creds.username,
      serverUrl: creds.serverUrl,
      username: creds.username,
      passwordEnc: encryptSecret(creds.password, userId),
      externalCalendarId: calendar.url,
      externalCalendarName: calendar.displayName,
      externalCalendarTz: calendar.timezone ?? "Europe/Berlin",
      status: "active",
    },
    update: {
      accountEmail: creds.username,
      serverUrl: creds.serverUrl,
      username: creds.username,
      passwordEnc: encryptSecret(creds.password, userId),
      externalCalendarId: calendar.url,
      externalCalendarName: calendar.displayName,
      externalCalendarTz: calendar.timezone ?? "Europe/Berlin",
      status: "active",
      lastSyncError: null,
    },
  });
  revalidatePath("/einstellungen");
}

function friendlyCaldavError(msg: string): string {
  if (msg.includes("401")) return "Benutzername oder App-Passwort falsch.";
  if (msg.includes("403")) return "Zugriff verweigert. Hast du die richtigen Berechtigungen erteilt?";
  if (msg.includes("ENOTFOUND") || msg.includes("nicht erreichbar")) return "Server nicht erreichbar — bitte URL prüfen.";
  if (msg.includes("Nur HTTPS")) return msg;
  return msg;
}

export async function syncCalendarNow(connectionId: string): Promise<{ ok: true; applied: number; deleted: number; pushed: number } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const conn = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) return { ok: false, error: "Verbindung nicht gefunden" };
  try {
    const res = await syncConnection(connectionId);
    revalidatePath("/einstellungen");
    revalidatePath("/shootings");
    return { ok: true, applied: res.applied, deleted: res.deleted, pushed: res.pushed };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Sync fehlgeschlagen" };
  }
}

export async function disconnectCalendar(connectionId: string): Promise<void> {
  const userId = await requireUserId();
  const conn = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) return;
  // Google: Tokens revoken
  if (conn.provider === "google") {
    try { await revokeGoogleConnection(conn); } catch { /* ignore */ }
  }
  await prisma.calendarConnection.delete({ where: { id: conn.id } });
  revalidatePath("/einstellungen");
}

// Holt die Liste aller Kalender im verbundenen Account (für den Picker).
export async function listAvailableCalendars(connectionId: string): Promise<
  | { ok: true; calendars: Array<{ id: string; summary: string; primary: boolean; timeZone: string | null; color: string | null; accessRole: string }>; selectedIds: string[]; pushTargetId: string | null }
  | { ok: false; error: string; needsReauth?: boolean }
> {
  const userId = await requireUserId();
  const conn = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) return { ok: false, error: "Verbindung nicht gefunden" };

  if (conn.provider !== "google") {
    // CalDAV-Liste wäre eigene Logik — Phase 2
    return { ok: false, error: "Multi-Kalender-Auswahl aktuell nur für Google verfügbar." };
  }

  try {
    const calendars = await listGoogleCalendars(conn);
    const selected = await prisma.selectedCalendar.findMany({ where: { connectionId } });
    const selectedIds = selected.map((s) => s.externalId);
    const pushTargetId = selected.find((s) => s.isPushTarget)?.externalId
      ?? conn.externalCalendarId
      ?? null;
    return { ok: true, calendars, selectedIds, pushTargetId };
  } catch (err: any) {
    // Bei „insufficient permission" Hinweis: Re-OAuth nötig
    const msg = err?.message ?? "";
    if (msg.includes("insufficient") || msg.includes("scope") || err?.code === 403) {
      return { ok: false, error: "Erweiterte Berechtigungen nötig. Bitte Google neu verbinden.", needsReauth: true };
    }
    return { ok: false, error: msg || "Kalender konnten nicht geladen werden" };
  }
}

export async function saveSelectedCalendars(connectionId: string, args: {
  selected: Array<{ id: string; summary: string; color: string | null; timezone: string | null }>;
  pushTargetId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const conn = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) return { ok: false, error: "Verbindung nicht gefunden" };
  if (args.selected.length === 0) return { ok: false, error: "Mindestens ein Kalender muss ausgewählt sein" };
  if (!args.selected.some((c) => c.id === args.pushTargetId)) {
    return { ok: false, error: "Der gewählte Push-Target-Kalender muss in der Auswahl enthalten sein" };
  }

  await prisma.$transaction(async (tx) => {
    // Bestehende ersetzen
    await tx.selectedCalendar.deleteMany({ where: { connectionId } });
    for (const c of args.selected) {
      await tx.selectedCalendar.create({
        data: {
          connectionId,
          externalId: c.id,
          displayName: c.summary,
          color: c.color,
          timezone: c.timezone,
          isPushTarget: c.id === args.pushTargetId,
        },
      });
    }
    // Connection-Felder als Convenience-Mirror aktualisieren
    const target = args.selected.find((c) => c.id === args.pushTargetId)!;
    await tx.calendarConnection.update({
      where: { id: connectionId },
      data: {
        externalCalendarId: target.id,
        externalCalendarName: target.summary,
        externalCalendarTz: target.timezone ?? "Europe/Berlin",
        // Beim Wechsel der Kalender-Auswahl: bestehende externe Events löschen, damit der nächste
        // Sync sauber neu lädt (sonst verbleiben Events aus deselektierten Kalendern)
      },
    });
    await tx.externalCalendarEvent.deleteMany({ where: { connectionId } });
  });

  revalidatePath("/einstellungen");
  revalidatePath("/shootings");
  return { ok: true };
}

export async function togglePseudonymize(connectionId: string): Promise<void> {
  const userId = await requireUserId();
  const conn = await prisma.calendarConnection.findFirst({ where: { id: connectionId, userId } });
  if (!conn) return;
  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { pseudonymize: !conn.pseudonymize },
  });
  revalidatePath("/einstellungen");
}
