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

export type DayStatus = {
  date: string;          // YYYY-MM-DD (lokales Datum)
  weekday: number;       // 0=Sonntag..6=Samstag
  maxShootings: number;  // effektives Maximum
  bookedCount: number;   // wie viele Shootings liegen an dem Tag
  freeSlots: number;     // max - booked, mind. 0
  isOverride: boolean;   // wurde durch Override gesetzt
  note: string | null;   // z.B. "Urlaub"
};

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

  const weeklyMap = new Map<number, number>();
  for (const w of weekly) weeklyMap.set(w.weekday, w.maxShootings);

  const overrideMap = new Map<string, { max: number; note: string | null }>();
  for (const o of overrides) overrideMap.set(o.date, { max: o.maxShootings, note: o.note });

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
    const max = override ? override.max : (weeklyMap.get(weekday) ?? 0);
    const booked = bookedByDay.get(ymd) ?? 0;
    days.push({
      date: ymd,
      weekday,
      maxShootings: max,
      bookedCount: booked,
      freeSlots: Math.max(0, max - booked),
      isOverride: !!override,
      note: override?.note ?? null,
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
