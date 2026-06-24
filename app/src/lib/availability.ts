// Verfügbarkeits-Logik (v2 — Zeitfenster-basiert, Multi-Tenant).
//
// Modell:
//   AvailabilityWeekly { ownerId, weekday, isAvailable, slotsJson }
//   AvailabilityOverride { ownerId, date, isAvailable, slotsJson, note }
//
// effektive Tagesfenster pro Datum (pro User):
//   override existiert  →  override.isAvailable ? parseSlots(override) : []
//   sonst weekly        →  weekly.isAvailable   ? parseSlots(weekly)   : []
//
// parseSlots(rec):
//   slotsJson vorhanden  →  Array von { start, end }-Fenstern
//   sonst                →  ein einzelnes Fenster aus User.defaultDay*Minutes („ganzer Tag")
//
// Belegung pro Tag:
//   gebuchte Shootings (mit ihrer durationMin + Paket-Buffer) belegen Zeit.
//   freie Fenster = Tagesfenster MINUS belegte Zeiten.
//
// Multi-Tenancy: alle DB-Funktionen erwarten `userId: string` als ersten Parameter
// und filtern strict per `ownerId: userId`.

import { prisma } from "@/lib/prisma";

export type TimeWindow = { start: number; end: number };  // Minuten seit Mitternacht (lokal)

export type DayStatus = {
  date: string;          // YYYY-MM-DD
  weekday: number;       // 0=Sonntag..6=Samstag
  isAvailable: boolean;  // explizit als verfügbar markiert
  windows: TimeWindow[]; // Tagesfenster (alles was Lisa als „offen" markiert hat)
  busyWindows: TimeWindow[];  // belegte Zeit durch Shootings inkl. Buffer
  freeWindows: TimeWindow[];  // windows MINUS busyWindows, gemerged
  freeMinutes: number;   // Summe freier Minuten
  isOverride: boolean;
  note: string | null;
  overrideId: string | null;
};

// Default-User-Defaults, falls noch kein User existiert (sollte fast nie passieren)
const DEFAULT_DAY_START = 540;  // 09:00
const DEFAULT_DAY_END   = 1080; // 18:00

// Neue User starten BLANK: alle 7 Wochentage als isAvailable=false.
// User muss aktiv konfigurieren, welche Tage offen sind (Lisa-Wunsch).
const WEEKLY_DEFAULTS = [false, false, false, false, false, false, false]; // [So..Sa]

export async function ensureWeeklyDefaults(userId: string): Promise<void> {
  const count = await prisma.availabilityWeekly.count({ where: { ownerId: userId } });
  if (count > 0) return;
  await prisma.availabilityWeekly.createMany({
    data: WEEKLY_DEFAULTS.map((isAvail, weekday) => ({
      ownerId: userId,
      weekday,
      isAvailable: isAvail,
      slotsJson: null,
    })),
  });
}

// --------------------- Helper ---------------------

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function minutesToHHMM(min: number | null | undefined): string {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

// JSON ↔ TimeWindow[]
export function parseSlotsJson(json: string | null): TimeWindow[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return null;
    const valid: TimeWindow[] = [];
    for (const p of parsed) {
      if (!p || typeof p !== "object") continue;
      const start = (p as TimeWindow).start;
      const end = (p as TimeWindow).end;
      if (typeof start !== "number" || typeof end !== "number") continue;
      if (start < 0 || end > 24 * 60 || start >= end) continue;
      valid.push({ start, end });
    }
    valid.sort((a, b) => a.start - b.start);
    return valid;
  } catch {
    return null;
  }
}

export function serializeSlots(windows: TimeWindow[]): string {
  return JSON.stringify(windows.map((w) => ({ start: w.start, end: w.end })));
}

// Resolve effektive Fenster aus einem Datensatz (Weekly oder Override).
function resolveWindows(
  isAvailable: boolean,
  slotsJson: string | null,
  userDefault: TimeWindow,
): TimeWindow[] {
  if (!isAvailable) return [];
  const parsed = parseSlotsJson(slotsJson);
  if (parsed && parsed.length > 0) return parsed;
  return [userDefault];
}

// Subtrahiert "busy" von "available" und liefert die Lücken.
// O((n+m) log) — sort + line sweep.
export function subtractBusy(available: TimeWindow[], busy: TimeWindow[]): TimeWindow[] {
  if (available.length === 0) return [];
  if (busy.length === 0) return [...available];

  // Merge overlapping busy-Fenster
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);
  const merged: TimeWindow[] = [];
  for (const b of sortedBusy) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      last.end = Math.max(last.end, b.end);
    } else {
      merged.push({ ...b });
    }
  }

  const result: TimeWindow[] = [];
  for (const win of available) {
    let cursor = win.start;
    for (const b of merged) {
      if (b.end <= cursor) continue;
      if (b.start >= win.end) break;
      if (b.start > cursor) {
        result.push({ start: cursor, end: Math.min(b.start, win.end) });
      }
      cursor = Math.max(cursor, b.end);
      if (cursor >= win.end) break;
    }
    if (cursor < win.end) result.push({ start: cursor, end: win.end });
  }
  return result;
}

// --------------------- Hauptfunktion ---------------------

export async function getAvailability(userId: string, from: Date, to: Date): Promise<DayStatus[]> {
  await ensureWeeklyDefaults(userId);

  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  const [user, weekly, overrides, shootings, bookings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultDayStartMinutes: true, defaultDayEndMinutes: true },
    }),
    prisma.availabilityWeekly.findMany({ where: { ownerId: userId } }),
    prisma.availabilityOverride.findMany({
      where: { ownerId: userId, date: { gte: ymdLocal(start), lt: ymdLocal(end) } },
    }),
    prisma.shooting.findMany({
      where: { ownerId: userId, scheduledAt: { gte: start, lt: end } },
      select: {
        scheduledAt: true,
        durationMin: true,
        package: {
          select: {
            bookingBufferBeforeMin: true,
            bookingBufferAfterMin: true,
            durationMin: true,
          },
        },
      },
    }),
    // PENDING + CONFIRMED Bookings ohne verknüpftes Shooting blockieren ebenfalls
    // den Tag — sonst zeigt der Kalender freie Zeit, in der eigentlich Anfragen liegen.
    // shootingId=null: angenommene Bookings sind bereits Shootings, doppelt zählen wäre falsch.
    prisma.booking.findMany({
      where: {
        ownerId: userId,
        status: { not: "CANCELLED" },
        shootingId: null,
        startAt: { gte: start, lt: end },
      },
      select: {
        startAt: true,
        endAt: true,
        bookingType: { select: { bufferBeforeMin: true, bufferAfterMin: true } },
      },
    }),
  ]);

  const userDefault: TimeWindow = {
    start: user?.defaultDayStartMinutes ?? DEFAULT_DAY_START,
    end: user?.defaultDayEndMinutes ?? DEFAULT_DAY_END,
  };

  const weeklyMap = new Map<number, { isAvailable: boolean; slotsJson: string | null }>();
  for (const w of weekly) weeklyMap.set(w.weekday, { isAvailable: w.isAvailable, slotsJson: w.slotsJson });

  const overrideMap = new Map<string, { id: string; isAvailable: boolean; slotsJson: string | null; note: string | null }>();
  for (const o of overrides) overrideMap.set(o.date, {
    id: o.id, isAvailable: o.isAvailable, slotsJson: o.slotsJson, note: o.note,
  });

  // Shootings + Bookings nach Datum gruppieren mit ihrem effektiven Zeitblock (inkl. Buffer)
  const busyByDay = new Map<string, TimeWindow[]>();
  for (const bk of bookings) {
    const key = ymdLocal(bk.startAt);
    const bufBefore = bk.bookingType?.bufferBeforeMin ?? 0;
    const bufAfter = bk.bookingType?.bufferAfterMin ?? 0;
    const startMin = bk.startAt.getHours() * 60 + bk.startAt.getMinutes();
    const endMin = bk.endAt.getHours() * 60 + bk.endAt.getMinutes();
    const blocked: TimeWindow = {
      start: Math.max(0, startMin - bufBefore),
      end: Math.min(24 * 60, endMin + bufAfter),
    };
    const arr = busyByDay.get(key);
    if (arr) arr.push(blocked);
    else busyByDay.set(key, [blocked]);
  }
  for (const sh of shootings) {
    if (!sh.scheduledAt) continue;
    const key = ymdLocal(sh.scheduledAt);
    const durationMin = sh.durationMin ?? sh.package?.durationMin ?? 60;
    const bufferBefore = sh.package?.bookingBufferBeforeMin ?? 0;
    const bufferAfter = sh.package?.bookingBufferAfterMin ?? 0;
    const startMin = sh.scheduledAt.getHours() * 60 + sh.scheduledAt.getMinutes();
    const endMin = startMin + durationMin;
    const blocked: TimeWindow = {
      start: Math.max(0, startMin - bufferBefore),
      end: Math.min(24 * 60, endMin + bufferAfter),
    };
    const arr = busyByDay.get(key);
    if (arr) arr.push(blocked);
    else busyByDay.set(key, [blocked]);
  }

  const days: DayStatus[] = [];
  const cur = new Date(start);
  while (cur < end) {
    const ymd = ymdLocal(cur);
    const weekday = cur.getDay();
    const override = overrideMap.get(ymd);
    const weeklyRule = weeklyMap.get(weekday);

    const isAvailable = override
      ? override.isAvailable
      : (weeklyRule?.isAvailable ?? false);

    const slotsJson = override?.slotsJson ?? weeklyRule?.slotsJson ?? null;
    const windows = resolveWindows(isAvailable, slotsJson, userDefault);
    const busy = busyByDay.get(ymd) ?? [];
    const free = subtractBusy(windows, busy);
    const freeMinutes = free.reduce((sum, w) => sum + (w.end - w.start), 0);

    days.push({
      date: ymd,
      weekday,
      isAvailable,
      windows,
      busyWindows: busy,
      freeWindows: free,
      freeMinutes,
      isOverride: !!override,
      note: override?.note ?? null,
      overrideId: override?.id ?? null,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Schneller Lookup für einen Einzeltag.
export async function getAvailabilityForDate(userId: string, ymd: string): Promise<DayStatus | null> {
  const d = parseYmd(ymd);
  if (!d) return null;
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  const days = await getAvailability(userId, d, next);
  return days[0] ?? null;
}

// Findet die nächsten N Tage mit mindestens `durationMin` zusammenhängender Freizeit.
// Default: 60 Min (irgendwas geht).
export async function findNextFreeDays(
  userId: string,
  from: Date,
  count: number,
  maxHorizonDays = 90,
  minDurationMin = 60,
): Promise<DayStatus[]> {
  const to = new Date(from);
  to.setDate(to.getDate() + maxHorizonDays + 1);
  const days = await getAvailability(userId, from, to);
  return days
    .filter((d) => d.freeWindows.some((w) => w.end - w.start >= minDurationMin))
    .slice(0, count);
}

// Gibt alle möglichen Startzeiten an einem Tag zurück, an denen ein Termin mit
// `durationMin` (+ Buffer) am Stück reinpasst.
// `intervalMin`: Granularität der Vorschläge (z.B. 15 → 10:00, 10:15, 10:30…).
export function findStartTimesInDay(
  day: DayStatus,
  durationMin: number,
  bufferBeforeMin: number,
  bufferAfterMin: number,
  intervalMin: number,
): number[] {
  const totalNeeded = bufferBeforeMin + durationMin + bufferAfterMin;
  if (totalNeeded <= 0) return [];
  const starts: number[] = [];
  for (const w of day.freeWindows) {
    if (w.end - w.start < totalNeeded) continue;
    // Erlaubte Startzeit ist w.start + bufferBefore … (w.end - durationMin - bufferAfter)
    const earliest = w.start + bufferBeforeMin;
    const latest = w.end - durationMin - bufferAfterMin;
    let t = Math.ceil(earliest / intervalMin) * intervalMin;
    while (t <= latest) {
      starts.push(t);
      t += intervalMin;
    }
  }
  return starts;
}
