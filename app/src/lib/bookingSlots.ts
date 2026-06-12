// Slot-Generation für Online-Buchungen.
//
// Pro Tag im Range:
//   1. Verfügbarkeit holen (Wochenregel oder Override).
//   2. Wenn Tag gesperrt (maxShootings=0) → keine Slots.
//   3. Tageszeitfenster bestimmen: Override > Wochenregel > Fallback 09:00-18:00.
//   4. Grid in slotIntervalMin rastern (z.B. 10:00, 10:30, 11:00 …).
//   5. Pro Slot prüfen:
//      - Endet vor Schließzeit?
//      - Verstößt nicht gegen minLeadHours (Mindest-Vorlauf)?
//      - Kein Konflikt mit existierenden Shootings/Bookings (inkl. Buffer).
//      - Tag hat noch freie Kapazität (Slot-Budget aus AvailabilityWeekly).
//
// Performance: alle DB-Reads in einem Rutsch für den ganzen Range.

import { prisma } from "@/lib/prisma";
import { getAvailability, ymdLocal } from "@/lib/availability";

export type BookableSlot = {
  startISO: string;
  endISO: string;
  label: string;       // "10:00"
};

export type DayWithSlots = {
  date: string;        // YYYY-MM-DD
  weekday: number;
  hasSlots: boolean;
  slots: BookableSlot[];
};

export type BookingTypeConfig = {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minLeadHours: number;
  maxAheadDays: number;
  slotIntervalMin: number;
};

const FALLBACK_START_MIN = 9 * 60;   // 09:00
const FALLBACK_END_MIN = 18 * 60;    // 18:00

export async function getDaysWithSlots(
  cfg: BookingTypeConfig,
  fromDate: Date,
): Promise<DayWithSlots[]> {
  const now = new Date();
  // Range = max(fromDate, now) bis fromDate + maxAheadDays
  const start = new Date(Math.max(fromDate.getTime(), now.getTime()));
  start.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + cfg.maxAheadDays);
  horizonEnd.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(Math.min(
    horizonEnd.getTime(),
    fromDate.getTime() + 35 * 86_400_000, // max. ~5 Wochen pro Lookup, fürs UI ausreichend
  ));
  rangeEnd.setDate(rangeEnd.getDate() + 1); // exklusiv

  if (rangeEnd <= start) return [];

  const minLeadAt = new Date(now.getTime() + cfg.minLeadHours * 3600_000);

  // Pufferzone für DB-Konflikt-Lookup: erweitere Range um Buffer auf beiden Seiten,
  // damit Konflikte am Tagesrand korrekt erkannt werden.
  const bufferMs = Math.max(cfg.bufferBeforeMin, cfg.bufferAfterMin) * 60_000;
  const dbRangeStart = new Date(start.getTime() - bufferMs);
  const dbRangeEnd = new Date(rangeEnd.getTime() + bufferMs);

  const [availability, shootings, bookings] = await Promise.all([
    getAvailability(start, rangeEnd),
    prisma.shooting.findMany({
      where: { scheduledAt: { gte: dbRangeStart, lt: dbRangeEnd } },
      select: { scheduledAt: true, durationMin: true },
    }),
    prisma.booking.findMany({
      where: {
        status: { not: "CANCELLED" },
        startAt: { gte: dbRangeStart, lt: dbRangeEnd },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  // Belegte Zeit-Intervalle inkl. Buffer (in ms-Epochen) für O(N)-Konflikt-Check.
  // Buffer wird auf beide Seiten des Termins gespannt.
  type Interval = { startMs: number; endMs: number };
  const blocks: Interval[] = [];
  for (const s of shootings) {
    if (!s.scheduledAt) continue;
    const startMs = s.scheduledAt.getTime() - cfg.bufferBeforeMin * 60_000;
    const endMs = s.scheduledAt.getTime() + (s.durationMin ?? 60) * 60_000 + cfg.bufferAfterMin * 60_000;
    blocks.push({ startMs, endMs });
  }
  for (const b of bookings) {
    const startMs = b.startAt.getTime() - cfg.bufferBeforeMin * 60_000;
    const endMs = b.endAt.getTime() + cfg.bufferAfterMin * 60_000;
    blocks.push({ startMs, endMs });
  }

  // Slot-Budget pro Tag: Zähle bereits an dem Tag gebuchte (Shooting + Booking).
  const bookedCountByDay = new Map<string, number>();
  for (const s of shootings) {
    if (!s.scheduledAt) continue;
    const k = ymdLocal(s.scheduledAt);
    bookedCountByDay.set(k, (bookedCountByDay.get(k) ?? 0) + 1);
  }
  for (const b of bookings) {
    const k = ymdLocal(b.startAt);
    bookedCountByDay.set(k, (bookedCountByDay.get(k) ?? 0) + 1);
  }

  const days: DayWithSlots[] = [];
  for (const dayInfo of availability) {
    if (dayInfo.maxShootings === 0) {
      days.push({ date: dayInfo.date, weekday: dayInfo.weekday, hasSlots: false, slots: [] });
      continue;
    }
    // Wenn Tag voll: keine Slots, auch wenn theoretisch Zeit wäre.
    const usedToday = bookedCountByDay.get(dayInfo.date) ?? 0;
    if (usedToday >= dayInfo.maxShootings) {
      days.push({ date: dayInfo.date, weekday: dayInfo.weekday, hasSlots: false, slots: [] });
      continue;
    }

    const startMin = dayInfo.startMinutes ?? FALLBACK_START_MIN;
    const endMin = dayInfo.endMinutes ?? FALLBACK_END_MIN;

    const [yStr, moStr, daStr] = dayInfo.date.split("-");
    const dayDate = new Date(Number(yStr), Number(moStr) - 1, Number(daStr));

    const slots: BookableSlot[] = [];
    for (let cur = startMin; cur + cfg.durationMin <= endMin; cur += cfg.slotIntervalMin) {
      const slotStart = new Date(dayDate);
      slotStart.setMinutes(cur);
      const slotEnd = new Date(slotStart.getTime() + cfg.durationMin * 60_000);

      // Mindest-Vorlauf
      if (slotStart < minLeadAt) continue;

      // Kollision mit existierendem Block?
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotEnd.getTime();
      let conflicts = false;
      for (const block of blocks) {
        if (slotStartMs < block.endMs && slotEndMs > block.startMs) {
          conflicts = true;
          break;
        }
      }
      if (conflicts) continue;

      const h = Math.floor(cur / 60);
      const m = cur % 60;
      slots.push({
        startISO: slotStart.toISOString(),
        endISO: slotEnd.toISOString(),
        label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      });
    }

    days.push({ date: dayInfo.date, weekday: dayInfo.weekday, hasSlots: slots.length > 0, slots });
  }

  return days;
}

// Validierung bei Buchung: prüft ob ein konkreter Slot zum Zeitpunkt der Anfrage NOCH frei ist.
// Schützt vor Race-Conditions (zwei Kundinnen klicken gleichzeitig denselben Slot).
export async function isSlotStillAvailable(
  cfg: BookingTypeConfig,
  startAt: Date,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const endAt = new Date(startAt.getTime() + cfg.durationMin * 60_000);
  const now = new Date();

  if (startAt < new Date(now.getTime() + cfg.minLeadHours * 3600_000)) {
    return { ok: false, reason: "Termin ist zu kurzfristig." };
  }

  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + cfg.maxAheadDays);
  if (startAt > horizonEnd) {
    return { ok: false, reason: "Termin liegt außerhalb des Buchungsfensters." };
  }

  // Verfügbarkeit am Tag prüfen
  const dayStart = new Date(startAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const availability = await getAvailability(dayStart, dayEnd);
  const day = availability[0];
  if (!day || day.maxShootings === 0) {
    return { ok: false, reason: "An diesem Tag werden keine Termine angeboten." };
  }
  if (day.bookedCount >= day.maxShootings) {
    return { ok: false, reason: "Dieser Tag ist mittlerweile voll." };
  }
  if (day.startMinutes != null && day.endMinutes != null) {
    const startMin = startAt.getHours() * 60 + startAt.getMinutes();
    const endMin = startMin + cfg.durationMin;
    if (startMin < day.startMinutes || endMin > day.endMinutes) {
      return { ok: false, reason: "Termin liegt außerhalb des Zeitfensters." };
    }
  }

  // Konflikt-Check inkl. Buffer
  const bufferBeforeMs = cfg.bufferBeforeMin * 60_000;
  const bufferAfterMs = cfg.bufferAfterMin * 60_000;
  const checkStart = new Date(startAt.getTime() - bufferAfterMs);
  const checkEnd = new Date(endAt.getTime() + bufferBeforeMs);

  const [conflictShooting, conflictBooking] = await Promise.all([
    prisma.shooting.findFirst({
      where: { scheduledAt: { gte: checkStart, lt: checkEnd } },
      select: { id: true, scheduledAt: true, durationMin: true },
    }),
    prisma.booking.findFirst({
      where: {
        status: { not: "CANCELLED" },
        OR: [
          { startAt: { gte: checkStart, lt: checkEnd } },
          { endAt: { gt: checkStart, lte: checkEnd } },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (conflictShooting) {
    // Genau prüfen: überlappt der Buffer wirklich?
    const csStart = conflictShooting.scheduledAt!.getTime() - bufferBeforeMs;
    const csEnd = conflictShooting.scheduledAt!.getTime()
      + (conflictShooting.durationMin ?? 60) * 60_000 + bufferAfterMs;
    if (startAt.getTime() < csEnd && endAt.getTime() > csStart) {
      return { ok: false, reason: "Dieser Termin ist mittlerweile vergeben." };
    }
  }
  if (conflictBooking) return { ok: false, reason: "Dieser Termin ist mittlerweile vergeben." };

  return { ok: true };
}
