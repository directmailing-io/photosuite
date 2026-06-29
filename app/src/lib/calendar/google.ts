// Google Calendar Integration — OAuth + Sync.
// Tokens werden AES-256-GCM verschlüsselt persistiert (lib/crypto.ts).
// Sync via syncToken (Incremental, RFC 5545 / Google sync guide).

import { google, type calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { CalendarConnection } from "@prisma/client";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  // Erlaubt uns die Auflistung aller Kalender des Users (non-sensitive scope)
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  // openid+email: damit wir die E-Mail-Adresse des verbundenen Accounts anzeigen können
  "openid",
  "email",
];
const APP_TAG_KEY = "lisaCrmShootingId";
const APP_TAG_KEY_DATE = "lisaCrmShootingDateId";
const APP_ORIGIN_KEY = "lisaCrmOrigin";
const APP_ORIGIN_VALUE = "lisa-crm";

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3006";
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth ist nicht konfiguriert (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET fehlen).");
  }
  return new google.auth.OAuth2(clientId, clientSecret, `${baseUrl}/api/calendar/google/callback`);
}

export function googleAuthUrl(state: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",         // Refresh-Token holen
    prompt: "consent",               // Refresh-Token jedes Mal ausgeben
    scope: SCOPES,
    include_granted_scopes: true,
    state,
  });
}

export async function googleExchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
  scope: string;
}> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google hat keinen Refresh-Token zurückgegeben — bitte Setup erneut starten.");
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const userInfo = await oauth2.userinfo.get();
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 60 * 60 * 1000);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    email: userInfo.data.email ?? "",
    scope: tokens.scope ?? SCOPES.join(" "),
  };
}

// Ein authenticated Calendar-Client für eine bestimmte Connection (refresht Tokens transparent).
export async function googleClientForConnection(conn: CalendarConnection): Promise<calendar_v3.Calendar> {
  if (!conn.refreshTokenEnc) {
    throw new Error("Refresh-Token fehlt für diese Verbindung");
  }
  const refresh = decryptSecret(conn.refreshTokenEnc, conn.userId);
  const access = conn.accessTokenEnc ? decryptSecret(conn.accessTokenEnc, conn.userId) : undefined;
  const client = getOAuthClient();
  client.setCredentials({
    refresh_token: refresh,
    access_token: access,
    expiry_date: conn.tokenExpiresAt?.getTime() ?? 0,
  });
  // Bei Token-Refresh: das neue access_token persistieren
  client.on("tokens", async (tokens) => {
    try {
      if (tokens.access_token) {
        await prisma.calendarConnection.update({
          where: { id: conn.id },
          data: {
            accessTokenEnc: encryptSecret(tokens.access_token, conn.userId),
            tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            // Refresh-Token rotiert i.d.R. nicht, aber wenn doch:
            ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token, conn.userId) } : {}),
          },
        });
      }
    } catch {
      // refresh persist failure ignorieren — Token bleibt im Speicher gültig
    }
  });
  return google.calendar({ version: "v3", auth: client });
}

// Liste aller Kalender im Google-Account (für die Auswahl, welche synchronisiert werden sollen).
// Liefert alle Kalender (auch read-only-abonnierte) — User entscheidet im Picker, welche relevant sind.
export async function listGoogleCalendars(conn: CalendarConnection): Promise<Array<{
  id: string; summary: string; primary: boolean; timeZone: string | null;
  color: string | null; accessRole: string; description?: string | null;
}>> {
  const calendar = await googleClientForConnection(conn);
  const res = await calendar.calendarList.list();
  return (res.data.items ?? []).map((c) => ({
    id: c.id ?? "",
    summary: c.summaryOverride ?? c.summary ?? c.id ?? "Kalender",
    primary: !!c.primary,
    timeZone: c.timeZone ?? null,
    color: c.backgroundColor ?? null,
    accessRole: c.accessRole ?? "reader",
    description: c.description,
  }));
}

// Inkrementeller Sync über ALLE ausgewählten Kalender der Connection.
// Jeder Kalender hat seinen eigenen syncToken.
export async function syncGoogleEvents(conn: CalendarConnection): Promise<{
  applied: number;
  deleted: number;
  fullResync: boolean;
}> {
  const calendar = await googleClientForConnection(conn);

  // Alle ausgewählten Kalender holen. Fallback: wenn keine ausgewählt aber externalCalendarId
  // gesetzt (Legacy-Daten aus erster Connect-Version), nutze diesen.
  let selected = await prisma.selectedCalendar.findMany({ where: { connectionId: conn.id } });
  if (selected.length === 0 && conn.externalCalendarId) {
    selected = [{
      id: "legacy",
      connectionId: conn.id,
      externalId: conn.externalCalendarId,
      displayName: conn.externalCalendarName ?? "Hauptkalender",
      color: null,
      timezone: conn.externalCalendarTz,
      isPushTarget: true,
      syncToken: conn.syncToken,
      ctag: null,
      lastSyncedAt: conn.lastSyncedAt,
      createdAt: new Date(),
    } as any];
  }

  let appliedTotal = 0;
  let deletedTotal = 0;
  let anyFullResync = false;

  for (const cal of selected) {
    const { applied, deleted, fullResync, newSyncToken } = await syncSingleGoogleCalendar(
      calendar, conn.id, cal.externalId, cal.syncToken,
    );
    appliedTotal += applied;
    deletedTotal += deleted;
    if (fullResync) anyFullResync = true;
    if (cal.id !== "legacy") {
      await prisma.selectedCalendar.update({
        where: { id: cal.id },
        data: { syncToken: newSyncToken, lastSyncedAt: new Date() },
      });
    }
  }

  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  return { applied: appliedTotal, deleted: deletedTotal, fullResync: anyFullResync };
}

async function syncSingleGoogleCalendar(
  calendar: calendar_v3.Calendar,
  connectionId: string,
  calendarId: string,
  startToken: string | null,
): Promise<{ applied: number; deleted: number; fullResync: boolean; newSyncToken: string | null }> {
  async function fetchPage(syncToken: string | null, pageToken: string | null) {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: 250,
      pageToken: pageToken ?? undefined,
      showDeleted: true,
    };
    if (syncToken) {
      params.syncToken = syncToken;
    } else {
      params.singleEvents = true;
      params.timeMin = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    }
    return calendar.events.list(params);
  }

  let pageToken: string | null = null;
  let syncToken: string | null = startToken;
  let applied = 0;
  let deleted = 0;
  let fullResync = false;
  let newSyncToken: string | null = null;

  try {
    do {
      const res = await fetchPage(syncToken, pageToken);
      const items = res.data.items ?? [];
      for (const ev of items) {
        if (ev.status === "cancelled") {
          if (ev.id) {
            await prisma.externalCalendarEvent.deleteMany({
              where: { connectionId, externalEventId: ev.id },
            });
            deleted++;
          }
          continue;
        }
        const startISO = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00` : null);
        const endISO = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T23:59:59` : null);
        if (!startISO || !endISO || !ev.id) continue;
        const isOurs = ev.extendedProperties?.private?.[APP_ORIGIN_KEY] === APP_ORIGIN_VALUE;
        const ourShootingId = ev.extendedProperties?.private?.[APP_TAG_KEY] ?? null;

        await prisma.externalCalendarEvent.upsert({
          where: { connectionId_externalEventId: { connectionId, externalEventId: ev.id } },
          create: {
            connectionId, externalEventId: ev.id,
            iCalUid: ev.iCalUID ?? null,
            startAt: new Date(startISO), endAt: new Date(endISO),
            summary: (ev.summary ?? "").slice(0, 80) || null,
            etag: ev.etag ?? null, isOurs, ourShootingId,
          },
          update: {
            iCalUid: ev.iCalUID ?? null,
            startAt: new Date(startISO), endAt: new Date(endISO),
            summary: (ev.summary ?? "").slice(0, 80) || null,
            etag: ev.etag ?? null, isOurs, ourShootingId,
          },
        });
        applied++;
      }
      pageToken = res.data.nextPageToken ?? null;
      if (!pageToken && res.data.nextSyncToken) newSyncToken = res.data.nextSyncToken;
    } while (pageToken);
  } catch (err: any) {
    if (err?.code === 410 || err?.response?.status === 410) {
      // Full-Resync — ohne syncToken erneut
      fullResync = true;
      const result = await syncSingleGoogleCalendar(calendar, connectionId, calendarId, null);
      return { ...result, fullResync: true };
    }
    throw err;
  }

  return { applied, deleted, fullResync, newSyncToken };
}

async function getPushTargetCalendarId(conn: CalendarConnection): Promise<string> {
  const target = await prisma.selectedCalendar.findFirst({
    where: { connectionId: conn.id, isPushTarget: true },
  });
  if (target) return target.externalId;
  if (conn.externalCalendarId) return conn.externalCalendarId; // Legacy-Fallback
  throw new Error("Kein Push-Kalender gewählt");
}

// Shooting in Google Calendar pushen (oder updaten, falls schon dort).
export async function upsertShootingInGoogle(args: {
  conn: CalendarConnection;
  shootingId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  description?: string | null;
}): Promise<{ eventId: string }> {
  const calendar = await googleClientForConnection(args.conn);
  const targetCalendarId = await getPushTargetCalendarId(args.conn);

  const pseudonymize = args.conn.pseudonymize;
  const summary = pseudonymize ? `Termin #${args.shootingId.slice(-6)}` : args.title;

  // Existiert das Event schon? → updaten via extendedProperties-Lookup
  const existing = await calendar.events.list({
    calendarId: targetCalendarId,
    privateExtendedProperty: [`${APP_TAG_KEY}=${args.shootingId}`],
    maxResults: 1,
    showDeleted: false,
  });
  const existingId = existing.data.items?.[0]?.id ?? null;

  const requestBody: calendar_v3.Schema$Event = {
    summary,
    description: pseudonymize ? `Erstellt durch Lisa CRM` : (args.description ?? `Lisa CRM · Shooting`),
    location: pseudonymize ? undefined : args.location ?? undefined,
    start: { dateTime: args.startAt.toISOString(), timeZone: args.conn.externalCalendarTz ?? "Europe/Berlin" },
    end: { dateTime: args.endAt.toISOString(), timeZone: args.conn.externalCalendarTz ?? "Europe/Berlin" },
    extendedProperties: {
      private: {
        [APP_TAG_KEY]: args.shootingId,
        [APP_ORIGIN_KEY]: APP_ORIGIN_VALUE,
      },
    },
    source: { title: "Lisa CRM", url: process.env.APP_BASE_URL ?? "" },
  };

  if (existingId) {
    const res = await calendar.events.update({
      calendarId: targetCalendarId,
      eventId: existingId,
      requestBody,
    });
    return { eventId: res.data.id ?? existingId };
  }

  const res = await calendar.events.insert({
    calendarId: targetCalendarId,
    requestBody,
  });
  return { eventId: res.data.id ?? "" };
}

export async function deleteShootingFromGoogle(conn: CalendarConnection, shootingId: string): Promise<void> {
  const calendar = await googleClientForConnection(conn);
  let targetCalendarId: string;
  try { targetCalendarId = await getPushTargetCalendarId(conn); } catch { return; }
  const res = await calendar.events.list({
    calendarId: targetCalendarId,
    privateExtendedProperty: [`${APP_TAG_KEY}=${shootingId}`],
    maxResults: 1,
  });
  const eventId = res.data.items?.[0]?.id;
  if (!eventId) return;
  try {
    await calendar.events.delete({
      calendarId: targetCalendarId,
      eventId,
    });
  } catch (err: any) {
    if (err?.code !== 404 && err?.response?.status !== 404) throw err;
  }
}

/**
 * Push eines konkreten Shooting-Termins in den Google-Kalender.
 * Analog zu upsertShootingInGoogle, aber mit eigenem Tag-Key, damit Termine
 * und Shootings nicht kollidieren (z.B. wenn Shooting + Date dasselbe Datum haben).
 */
export async function upsertDateInGoogle(args: {
  conn: CalendarConnection;
  dateId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  description?: string | null;
}): Promise<{ eventId: string }> {
  const calendar = await googleClientForConnection(args.conn);
  const targetCalendarId = await getPushTargetCalendarId(args.conn);

  const pseudonymize = args.conn.pseudonymize;
  const summary = pseudonymize ? `Termin #${args.dateId.slice(-6)}` : args.title;

  const existing = await calendar.events.list({
    calendarId: targetCalendarId,
    privateExtendedProperty: [`${APP_TAG_KEY_DATE}=${args.dateId}`],
    maxResults: 1,
    showDeleted: false,
  });
  const existingId = existing.data.items?.[0]?.id ?? null;

  const requestBody: calendar_v3.Schema$Event = {
    summary,
    description: pseudonymize ? `Erstellt durch Lisa CRM` : (args.description ?? `Lisa CRM · Termin`),
    location: pseudonymize ? undefined : args.location ?? undefined,
    start: { dateTime: args.startAt.toISOString(), timeZone: args.conn.externalCalendarTz ?? "Europe/Berlin" },
    end: { dateTime: args.endAt.toISOString(), timeZone: args.conn.externalCalendarTz ?? "Europe/Berlin" },
    extendedProperties: {
      private: {
        [APP_TAG_KEY_DATE]: args.dateId,
        [APP_ORIGIN_KEY]: APP_ORIGIN_VALUE,
      },
    },
    source: { title: "Lisa CRM", url: process.env.APP_BASE_URL ?? "" },
  };

  if (existingId) {
    const res = await calendar.events.update({
      calendarId: targetCalendarId,
      eventId: existingId,
      requestBody,
    });
    return { eventId: res.data.id ?? existingId };
  }

  const res = await calendar.events.insert({
    calendarId: targetCalendarId,
    requestBody,
  });
  return { eventId: res.data.id ?? "" };
}

export async function deleteDateFromGoogle(conn: CalendarConnection, dateId: string): Promise<void> {
  const calendar = await googleClientForConnection(conn);
  let targetCalendarId: string;
  try { targetCalendarId = await getPushTargetCalendarId(conn); } catch { return; }
  const res = await calendar.events.list({
    calendarId: targetCalendarId,
    privateExtendedProperty: [`${APP_TAG_KEY_DATE}=${dateId}`],
    maxResults: 1,
  });
  const eventId = res.data.items?.[0]?.id;
  if (!eventId) return;
  try {
    await calendar.events.delete({ calendarId: targetCalendarId, eventId });
  } catch (err: any) {
    if (err?.code !== 404 && err?.response?.status !== 404) throw err;
  }
}

export async function revokeGoogleConnection(conn: CalendarConnection): Promise<void> {
  if (!conn.refreshTokenEnc) return;
  const refresh = decryptSecret(conn.refreshTokenEnc, conn.userId);
  const client = getOAuthClient();
  try {
    await client.revokeToken(refresh);
  } catch {
    // Wenn das Token bei Google nicht mehr existiert, ist's auch egal
  }
}
