// Verfügbarkeits-Logik für Lisas Kalender.
//
// Modell: Wochenregel (AvailabilityWeekly, eine Row pro Wochentag) + Tag-Override
// (AvailabilityOverride, einzelne Tage). Override sticht Regel.
//
// effectiveMax pro Tag:
//   override.maxShootings   wenn ein Override existiert
//   weekly[weekday]         sonst die Wochenregel
//   0                       Fallback (nicht konfiguriert = nicht verfügbar)
//
// freeSlots = max(0, effectiveMax - bookedCount)
// Datumsvergleich läuft auf lokaler Zeit (Server-TZ) — alle Boudoir-Shootings
// finden lokal statt, eine Mischung mit UTC würde nur Bugs einführen.

import { prisma } from "@/lib/prisma";

// Sinnvolle Boudoir-Photographin-Defaults: Mo-Sa je 1 Slot, So zu.
// Wird beim ersten Aufruf jeder Verfügbarkeits-anzeigenden Seite idempotent gesetzt,
// damit Lisa nicht erst durch Settings muss bevor der Kalender bunt wird.
const WEEKLY_DEFAULTS = [0, 1, 1, 1, 1, 1, 1]; // [So, Mo, Di, Mi, Do, Fr, Sa]

export async function ensureWeeklyDefaults(): Promise<void> {
  const count = await prisma.availabilityWeekly.count();
  if (count > 0) return;
  await prisma.availabilityWeekly.createMany({
    data: WEEKLY_DEFAULTS.map((max, weekday) => ({ weekday, maxShootings: max })),
  });
}

export type DayStatus = {
  date: string;            // YYYY-MM-DD (lokales Datum)
  weekday: number;         // 0=Sonntag..6=Samstag
  maxShootings: number;    // effektives Maximum
  bookedCount: number;     // wie viele Shootings liegen an dem Tag
  freeSlots: number;       // max - booked, mind. 0
  startMinutes: number | null;  // Empfehlungs-Zeitfenster (lokal)
  endMinutes: number | null;
  isOverride: boolean;     // wurde durch Override gesetzt
  note: string | null;     // z.B. "Urlaub"
  overrideId: string | null;  // zum direkten Bearbeiten/Entfernen aus dem Kalender
};

// Hilfsfunktionen für Minuten ↔ "HH:MM"
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

// Holt alle Tage zwischen from (inkl.) und to (exkl.) mit ihrem Verfügbarkeits-Status.
// Liest in EINEM Query: Weekly-Regeln + Overrides + Shooting-Counts.
export async function getAvailability(from: Date, to: Date): Promise<DayStatus[]> {
  // Sicherstellen, dass Wochenregel-Defaults da sind — sonst sieht Lisa nur graue Tage.
  // Idempotent: noop wenn schon konfiguriert.
  await ensureWeeklyDefaults();

  // Range normalisieren: from auf 00:00, to auf 00:00 (exklusiv)
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  const [weekly, overrides, shootings] = await Promise.all([
    prisma.availabilityWeekly.findMany(),
    prisma.availabilityOverride.findMany({
      where: {
        date: { gte: ymdLocal(start), lt: ymdLocal(end) },
      },
    }),
    prisma.shooting.findMany({
      where: { scheduledAt: { gte: start, lt: end } },
      select: { scheduledAt: true },
    }),
  ]);

  const weeklyMap = new Map<number, { max: number; startMin: number | null; endMin: number | null }>();
  for (const w of weekly) {
    weeklyMap.set(w.weekday, { max: w.maxShootings, startMin: w.startMinutes, endMin: w.endMinutes });
  }

  const overrideMap = new Map<string, {
    id: string; max: number; note: string | null; startMin: number | null; endMin: number | null;
  }>();
  for (const o of overrides) {
    overrideMap.set(o.date, {
      id: o.id, max: o.maxShootings, note: o.note,
      startMin: o.startMinutes, endMin: o.endMinutes,
    });
  }

  const bookedByDay = new Map<string, number>();
  for (const s of shootings) {
    if (!s.scheduledAt) continue;
    const key = ymdLocal(s.scheduledAt);
    bookedByDay.set(key, (bookedByDay.get(key) ?? 0) + 1);
  }

  const days: DayStatus[] = [];
  const cur = new Date(start);
  while (cur < end) {
    const ymd = ymdLocal(cur);
    const weekday = cur.getDay();
    const override = overrideMap.get(ymd);
    const weeklyRule = weeklyMap.get(weekday);
    // Override sticht Wochenregel — auch in Zeitfenster-Logik.
    const max = override ? override.max : (weeklyRule?.max ?? 0);
    const startMin = override?.startMin ?? weeklyRule?.startMin ?? null;
    const endMin = override?.endMin ?? weeklyRule?.endMin ?? null;
    const booked = bookedByDay.get(ymd) ?? 0;
    days.push({
      date: ymd,
      weekday,
      maxShootings: max,
      bookedCount: booked,
      freeSlots: Math.max(0, max - booked),
      startMinutes: startMin,
      endMinutes: endMin,
      isOverride: !!override,
      note: override?.note ?? null,
      overrideId: override?.id ?? null,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Schnellprüfung für einen einzelnen Tag.
export async function getAvailabilityForDate(ymd: string): Promise<DayStatus | null> {
  const d = parseYmd(ymd);
  if (!d) return null;
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  const days = await getAvailability(d, next);
  return days[0] ?? null;
}

// Findet die nächsten N freien Tage ab `from`, max 365 Tage in die Zukunft.
export async function findNextFreeDays(from: Date, count: number, maxHorizonDays = 90): Promise<DayStatus[]> {
  const to = new Date(from);
  to.setDate(to.getDate() + maxHorizonDays + 1);
  const days = await getAvailability(from, to);
  return days.filter((d) => d.freeSlots > 0).slice(0, count);
}
