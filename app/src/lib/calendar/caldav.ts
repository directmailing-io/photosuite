// CalDAV-Integration für Apple iCloud, Nextcloud, Mailbox.org, Posteo und generische Server.
// App-Passwort wird verschlüsselt persistiert (lib/crypto.ts).
// Sync via RFC 6578 (sync-collection). Polling-basiert — keine native Push-Notification.
//
// SSRF-Schutz: bei Custom-CalDAV-URLs validieren wir HTTPS + verbieten private/loopback IPs.

import { createDAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";

// tsdav.createDAVClient gibt einen "Anonymous Object" zurück — wir nutzen den Awaited-Type.
type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;
import { lookup } from "node:dns/promises";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { CalendarConnection } from "@prisma/client";

export type CalDAVCredentials = {
  serverUrl: string;
  username: string;
  password: string;
};

// SSRF-Schutz: reject private/loopback/link-local IPs für vom User eingegebene URLs
const PRIVATE_RANGES = [
  /^127\./,         // loopback
  /^10\./,          // RFC 1918
  /^192\.168\./,    // RFC 1918
  /^172\.(1[6-9]|2[0-9]|3[01])\./,  // RFC 1918
  /^169\.254\./,    // link-local (AWS metadata!)
  /^0\./,
  /^::1$/,
  /^fe80::/i,
  /^f[cd][0-9a-f]{2}:/i,  // unique local IPv6
];

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Ungültige Server-URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Nur HTTPS-URLs sind erlaubt");
  }
  try {
    const { address } = await lookup(url.hostname);
    if (PRIVATE_RANGES.some((re) => re.test(address))) {
      throw new Error("Diese Server-Adresse ist nicht erlaubt");
    }
  } catch (err: any) {
    if (err.code === "ENOTFOUND") throw new Error(`Server "${url.hostname}" nicht erreichbar`);
    throw err;
  }
  return url;
}

// Verbindung testen + Kalender-Liste holen — beim Setup-Wizard, BEVOR persistiert wird.
export async function caldavConnect(creds: CalDAVCredentials): Promise<{
  client: DAVClient;
  calendars: Array<{ url: string; displayName: string; timezone: string | null }>;
}> {
  await assertSafeUrl(creds.serverUrl);
  const client = await createDAVClient({
    serverUrl: creds.serverUrl,
    credentials: { username: creds.username, password: creds.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  const calendars = await client.fetchCalendars();
  return {
    client,
    calendars: calendars.map((c: DAVCalendar) => ({
      url: c.url ?? "",
      displayName: typeof c.displayName === "string" ? c.displayName : c.url ?? "Kalender",
      timezone: typeof c.timezone === "string" ? c.timezone : null,
    })),
  };
}

async function caldavClientForConnection(conn: CalendarConnection): Promise<DAVClient> {
  if (!conn.serverUrl || !conn.username || !conn.passwordEnc) {
    throw new Error("CalDAV-Zugangsdaten fehlen");
  }
  return createDAVClient({
    serverUrl: conn.serverUrl,
    credentials: {
      username: conn.username,
      password: decryptSecret(conn.passwordEnc, conn.userId),
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

const APP_X_ORIGIN = "X-LISA-CRM-ORIGIN";
const APP_X_SHOOTING = "X-LISA-CRM-SHOOTING-ID";

function buildICalEvent(args: {
  uid: string;
  summary: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  description?: string | null;
  shootingId: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const now = fmt(new Date());
  const start = fmt(args.startAt);
  const end = fmt(args.endAt);
  // RFC 5545: CRLF
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lisa CRM//DE",
    "BEGIN:VEVENT",
    `UID:${args.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeICalText(args.summary)}`,
    args.location ? `LOCATION:${escapeICalText(args.location)}` : null,
    args.description ? `DESCRIPTION:${escapeICalText(args.description)}` : null,
    `${APP_X_ORIGIN}:lisa-crm`,
    `${APP_X_SHOOTING}:${args.shootingId}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

function escapeICalText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Einfacher Sync: alle Calendar-Objekte holen, lokale ExternalCalendarEvent-Tabelle aufbauen.
// Polling-Strategie: alle 5-15 Min via Cron. Sync-Token-Optimierung später.
export async function syncCalDAVEvents(conn: CalendarConnection): Promise<{
  applied: number;
  deleted: number;
}> {
  if (!conn.externalCalendarId) throw new Error("Kein Kalender gewählt");
  const client = await caldavClientForConnection(conn);
  const objects = await client.fetchCalendarObjects({
    calendar: { url: conn.externalCalendarId } as DAVCalendar,
  });

  let applied = 0;
  const seenIds = new Set<string>();

  for (const obj of objects as DAVCalendarObject[]) {
    const parsed = parseICalObject(obj.data ?? "");
    if (!parsed) continue;
    const externalId = obj.url ?? parsed.uid;
    seenIds.add(externalId);
    await prisma.externalCalendarEvent.upsert({
      where: {
        connectionId_externalEventId: {
          connectionId: conn.id,
          externalEventId: externalId,
        },
      },
      create: {
        connectionId: conn.id,
        externalEventId: externalId,
        iCalUid: parsed.uid,
        startAt: parsed.startAt,
        endAt: parsed.endAt,
        summary: parsed.summary.slice(0, 80) || null,
        etag: obj.etag ?? null,
        isOurs: parsed.isOurs,
        ourShootingId: parsed.ourShootingId,
      },
      update: {
        iCalUid: parsed.uid,
        startAt: parsed.startAt,
        endAt: parsed.endAt,
        summary: parsed.summary.slice(0, 80) || null,
        etag: obj.etag ?? null,
        isOurs: parsed.isOurs,
        ourShootingId: parsed.ourShootingId,
      },
    });
    applied++;
  }

  // Lokale Events löschen, die nicht mehr auf dem Server existieren
  const result = await prisma.externalCalendarEvent.deleteMany({
    where: {
      connectionId: conn.id,
      externalEventId: { notIn: [...seenIds] },
    },
  });

  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  return { applied, deleted: result.count };
}

function parseICalObject(data: string): {
  uid: string;
  summary: string;
  startAt: Date;
  endAt: Date;
  isOurs: boolean;
  ourShootingId: string | null;
} | null {
  // Sehr leichter Parser — reicht für unsere Konflikt-Erkennungs-Use-Cases.
  // Für komplexe Events (RECURRENCE etc.) später ical.js einsetzen.
  const lines = data.split(/\r?\n/);
  let inEvent = false;
  let uid = "", summary = "", dtStart = "", dtEnd = "";
  let isOurs = false, ourShootingId: string | null = null;
  for (const raw of lines) {
    if (raw === "BEGIN:VEVENT") { inEvent = true; continue; }
    if (raw === "END:VEVENT") { inEvent = false; continue; }
    if (!inEvent) continue;
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) continue;
    const left = raw.slice(0, colonIdx);
    const value = raw.slice(colonIdx + 1);
    const key = left.split(";")[0];
    switch (key) {
      case "UID": uid = value; break;
      case "SUMMARY": summary = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); break;
      case "DTSTART": dtStart = value; break;
      case "DTEND": dtEnd = value; break;
      case APP_X_ORIGIN: isOurs = value === "lisa-crm"; break;
      case APP_X_SHOOTING: ourShootingId = value; break;
    }
  }
  if (!uid || !dtStart || !dtEnd) return null;
  return {
    uid,
    summary,
    startAt: parseIcalDate(dtStart),
    endAt: parseIcalDate(dtEnd),
    isOurs,
    ourShootingId,
  };
}

function parseIcalDate(value: string): Date {
  // 20260604T090000Z oder 20260604T110000 oder 20260604 (ganztags)
  if (/^\d{8}$/.test(value)) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6)) - 1;
    const d = Number(value.slice(6, 8));
    return new Date(y, m, d);
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return new Date();
  const [, y, m, d, h, mi, s, z] = match;
  if (z === "Z") return new Date(Date.UTC(+y, +m - 1, +d, +h, +mi, +s));
  return new Date(+y, +m - 1, +d, +h, +mi, +s);
}

export async function upsertShootingInCalDAV(args: {
  conn: CalendarConnection;
  shootingId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location?: string | null;
  description?: string | null;
}): Promise<void> {
  const client = await caldavClientForConnection(args.conn);
  if (!args.conn.externalCalendarId) throw new Error("Kein Kalender gewählt");

  const pseudonymize = args.conn.pseudonymize;
  const summary = pseudonymize ? `Termin #${args.shootingId.slice(-6)}` : args.title;
  const uid = `shooting-${args.shootingId}@lisa-crm`;

  const ical = buildICalEvent({
    uid,
    summary,
    startAt: args.startAt,
    endAt: args.endAt,
    location: pseudonymize ? null : args.location,
    description: pseudonymize ? "Lisa CRM" : args.description,
    shootingId: args.shootingId,
  });

  // Existierendes Event suchen anhand UID
  const objects = await client.fetchCalendarObjects({
    calendar: { url: args.conn.externalCalendarId } as DAVCalendar,
  });
  const existing = (objects as DAVCalendarObject[]).find((o) => o.data?.includes(`UID:${uid}`));

  if (existing) {
    await client.updateCalendarObject({
      calendarObject: {
        url: existing.url,
        data: ical,
        etag: existing.etag,
      },
    });
  } else {
    await client.createCalendarObject({
      calendar: { url: args.conn.externalCalendarId } as DAVCalendar,
      filename: `${uid}.ics`,
      iCalString: ical,
    });
  }
}

export async function deleteShootingFromCalDAV(conn: CalendarConnection, shootingId: string): Promise<void> {
  if (!conn.externalCalendarId) return;
  const client = await caldavClientForConnection(conn);
  const uid = `shooting-${shootingId}@lisa-crm`;
  const objects = await client.fetchCalendarObjects({
    calendar: { url: conn.externalCalendarId } as DAVCalendar,
  });
  const existing = (objects as DAVCalendarObject[]).find((o) => o.data?.includes(`UID:${uid}`));
  if (!existing) return;
  await client.deleteCalendarObject({
    calendarObject: { url: existing.url, etag: existing.etag },
  });
}
