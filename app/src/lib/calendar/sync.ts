// Sync-Orchestrator: leitet je nach Provider an den passenden Sync-Client weiter.
// Wird aufgerufen aus: Server-Action "Jetzt synchronisieren", Webhook-Endpoint (Google),
// Cron-Job für CalDAV-Polling.

import { prisma } from "@/lib/prisma";
import {
  syncGoogleEvents, upsertShootingInGoogle, deleteShootingFromGoogle,
  upsertDateInGoogle, deleteDateFromGoogle,
} from "./google";
import {
  syncCalDAVEvents, upsertShootingInCalDAV, deleteShootingFromCalDAV,
} from "./caldav";
import type { CalendarConnection } from "@prisma/client";

const CALDAV_PROVIDERS = new Set(["apple", "nextcloud", "mailbox", "posteo", "caldav_custom"]);

export async function syncConnection(connId: string): Promise<{ applied: number; deleted: number; pushed: number; provider: string }> {
  const conn = await prisma.calendarConnection.findUnique({ where: { id: connId } });
  if (!conn) throw new Error("Verbindung nicht gefunden");
  if (!conn.syncEnabled || conn.status !== "active") return { applied: 0, deleted: 0, pushed: 0, provider: conn.provider };

  try {
    // 1) Pull: externe Events in lokale DB übernehmen
    let res: { applied: number; deleted: number };
    if (conn.provider === "google") {
      const result = await syncGoogleEvents(conn);
      res = { applied: result.applied, deleted: result.deleted };
    } else if (CALDAV_PROVIDERS.has(conn.provider)) {
      res = await syncCalDAVEvents(conn);
    } else {
      throw new Error(`Provider ${conn.provider} noch nicht unterstützt`);
    }

    // 2) Push: alle aktiven Shootings, die noch nicht im externen Kalender sind, hinpushen.
    //    Identifikation via ExternalCalendarEvent.ourShootingId (von einem vorherigen Sync gemerkt).
    const pushed = await backfillShootingsToCalendar(conn);

    return { ...res, pushed, provider: conn.provider };
  } catch (err: any) {
    await prisma.calendarConnection.update({
      where: { id: connId },
      data: { lastSyncError: err?.message?.slice(0, 500) ?? "Unbekannter Fehler" },
    });
    throw err;
  }
}

// Holt alle aktiven Shootings des Users, prüft welche noch nicht im externen Kalender sind
// (über ourShootingId-Marker), und pushed die fehlenden hin.
async function backfillShootingsToCalendar(conn: import("@prisma/client").CalendarConnection): Promise<number> {
  // Bestehende eigene Events sind schon getaggt — finde, welche Shooting-IDs schon dort sind
  const alreadyThere = await prisma.externalCalendarEvent.findMany({
    where: { connectionId: conn.id, ourShootingId: { not: null } },
    select: { ourShootingId: true },
  });
  const knownIds = new Set(alreadyThere.map((e) => e.ourShootingId!));

  // Hole alle Shootings dieses Users mit Termin in der nahen Zukunft / Vergangenheit (90 Tage zurück, alles vorwärts)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const shootings = await prisma.shooting.findMany({
    where: {
      ownerId: conn.userId,
      scheduledAt: { gte: cutoff },
      // Stornorechnungen / Abgesagte ausnehmen — wir pushen nur „echte" Termine
    },
    select: {
      id: true, title: true, scheduledAt: true, durationMin: true, location: true,
    },
  });

  let pushed = 0;
  for (const sh of shootings) {
    if (!sh.scheduledAt) continue;
    if (knownIds.has(sh.id)) continue;
    const end = new Date(sh.scheduledAt.getTime() + (sh.durationMin ?? 60) * 60_000);
    try {
      if (conn.provider === "google") {
        const { upsertShootingInGoogle } = await import("./google");
        await upsertShootingInGoogle({
          conn, shootingId: sh.id, title: sh.title,
          startAt: sh.scheduledAt, endAt: end, location: sh.location,
        });
      } else if (CALDAV_PROVIDERS.has(conn.provider)) {
        const { upsertShootingInCalDAV } = await import("./caldav");
        await upsertShootingInCalDAV({
          conn, shootingId: sh.id, title: sh.title,
          startAt: sh.scheduledAt, endAt: end, location: sh.location,
        });
      }
      pushed++;
    } catch {
      // Best effort
    }
  }
  return pushed;
}

// Wird vom Shooting-CRUD aufgerufen — pushed das Shooting in den verbundenen Kalender.
// Best-effort: Fehler werden geloggt aber blockieren die App nicht.
export async function pushShootingToCalendar(userId: string, args: {
  shootingId: string;
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  location?: string | null;
  description?: string | null;
}): Promise<void> {
  if (!args.startAt || !args.endAt) return;
  const conns = await prisma.calendarConnection.findMany({
    where: { userId, status: "active", syncEnabled: true, externalCalendarId: { not: null } },
  });
  await Promise.allSettled(conns.map(async (conn) => {
    try {
      if (conn.provider === "google") {
        await upsertShootingInGoogle({
          conn, shootingId: args.shootingId, title: args.title,
          startAt: args.startAt!, endAt: args.endAt!,
          location: args.location, description: args.description,
        });
      } else if (CALDAV_PROVIDERS.has(conn.provider)) {
        await upsertShootingInCalDAV({
          conn, shootingId: args.shootingId, title: args.title,
          startAt: args.startAt!, endAt: args.endAt!,
          location: args.location, description: args.description,
        });
      }
    } catch (err: any) {
      await prisma.calendarConnection.update({
        where: { id: conn.id },
        data: { lastSyncError: `Push-Fehler: ${err?.message?.slice(0, 200) ?? "?"}` },
      });
    }
  }));
}

/**
 * Push eines konkreten ShootingDate-Eintrags in alle aktiven Kalender-Verbindungen.
 * Wird aufgerufen, wenn `ShootingDate.syncToCalendar === true` ist.
 * CalDAV-Push für Dates ist noch nicht implementiert (best-effort, kein Throw).
 */
export async function pushDateToCalendar(userId: string, args: {
  dateId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  description?: string | null;
}): Promise<void> {
  const conns = await prisma.calendarConnection.findMany({
    where: { userId, status: "active", syncEnabled: true, externalCalendarId: { not: null } },
  });
  await Promise.allSettled(conns.map(async (conn) => {
    try {
      if (conn.provider === "google") {
        await upsertDateInGoogle({
          conn,
          dateId: args.dateId,
          title: args.title,
          startAt: args.startAt,
          endAt: args.endAt,
          location: args.location,
          description: args.description,
        });
      }
      // CalDAV-Push für Dates: noch nicht implementiert. Lisa nutzt aktuell Google.
    } catch (err: any) {
      await prisma.calendarConnection.update({
        where: { id: conn.id },
        data: { lastSyncError: `Termin-Push-Fehler: ${err?.message?.slice(0, 200) ?? "?"}` },
      });
    }
  }));
}

export async function removeDateFromCalendar(userId: string, dateId: string): Promise<void> {
  const conns = await prisma.calendarConnection.findMany({
    where: { userId, status: "active", syncEnabled: true, externalCalendarId: { not: null } },
  });
  await Promise.allSettled(conns.map(async (conn) => {
    try {
      if (conn.provider === "google") {
        await deleteDateFromGoogle(conn, dateId);
      }
    } catch {
      // ignorieren — beim nächsten Sync-Lauf wird neu versucht
    }
  }));
}

export async function removeShootingFromCalendar(userId: string, shootingId: string): Promise<void> {
  const conns = await prisma.calendarConnection.findMany({
    where: { userId, status: "active", syncEnabled: true, externalCalendarId: { not: null } },
  });
  await Promise.allSettled(conns.map(async (conn) => {
    try {
      if (conn.provider === "google") await deleteShootingFromGoogle(conn, shootingId);
      else if (CALDAV_PROVIDERS.has(conn.provider)) await deleteShootingFromCalDAV(conn, shootingId);
    } catch {
      // ignorieren — beim nächsten Sync-Lauf kommen wir hier nochmal vorbei
    }
  }));
}

// Konflikt-Check: gibt es externe Events im selben Zeitfenster?
export async function checkConflicts(args: {
  userId: string;
  startAt: Date;
  endAt: Date;
  ignoreShootingId?: string;
}): Promise<Array<{ provider: string; summary: string | null; startAt: Date; endAt: Date; isOurs: boolean }>> {
  const conns = await prisma.calendarConnection.findMany({
    where: { userId: args.userId, status: "active", syncEnabled: true },
    select: { id: true, provider: true },
  });
  if (conns.length === 0) return [];

  const events = await prisma.externalCalendarEvent.findMany({
    where: {
      connectionId: { in: conns.map((c) => c.id) },
      startAt: { lt: args.endAt },
      endAt: { gt: args.startAt },
      ...(args.ignoreShootingId ? { ourShootingId: { not: args.ignoreShootingId } } : {}),
    },
    include: { connection: { select: { provider: true } } },
  });

  return events.map((e) => ({
    provider: e.connection.provider,
    summary: e.summary,
    startAt: e.startAt,
    endAt: e.endAt,
    isOurs: e.isOurs,
  }));
}
