// Slot-Generation für Online-Buchungen (v2 — auf Zeitfenster-Verfügbarkeit, Multi-Tenant).
//
// Pro Tag im Range:
//   1. Verfügbarkeit holen → DayStatus mit freeWindows[] (nach Abzug der Shootings).
//   2. Für jedes freie Fenster: Slots in slotIntervalMin rastern.
//   3. Pro Slot: durationMin + Buffer prüfen, minLeadHours respektieren,
//      Konflikt mit anderen Online-Bookings ausschließen.
//
// Multi-Tenancy: alle Funktionen erwarten `userId: string` als ersten Parameter
// und filtern alle DB-Queries strict per `ownerId: userId`.

import { prisma } from "@/lib/prisma";
import { getAvailability, ymdLocal, subtractBusy, type TimeWindow } from "@/lib/availability";

export type BookableSlot = {
  startISO: string;
  endISO: string;
  label: string;       // "10:00"
};

export type DayWithSlots = {
  date: string;
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

export async function getDaysWithSlots(
  userId: string,
  cfg: BookingTypeConfig,
  fromDate: Date,
): Promise<DayWithSlots[]> {
  const now = new Date();
  const start = new Date(Math.max(fromDate.getTime(), now.getTime()));
  start.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + cfg.maxAheadDays);
  horizonEnd.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(Math.min(
    horizonEnd.getTime(),
    fromDate.getTime() + 35 * 86_400_000,
  ));
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  if (rangeEnd <= start) return [];

  const minLeadAt = new Date(now.getTime() + cfg.minLeadHours * 3600_000);

  // Andere Bookings (nicht Shootings — die sind schon in DayStatus.freeWindows berücksichtigt)
  // als zusätzliche Busy-Fenster pro Tag.
  const bookings = await prisma.booking.findMany({
    where: {
      ownerId: userId,
      status: { not: "CANCELLED" },
      startAt: { gte: start },
      endAt: { lt: rangeEnd },
    },
    select: { startAt: true, endAt: true },
  });
  const otherBusyByDay = new Map<string, TimeWindow[]>();
  for (const b of bookings) {
    const key = ymdLocal(b.startAt);
    const startMin = b.startAt.getHours() * 60 + b.startAt.getMinutes();
    const endMin = b.endAt.getHours() * 60 + b.endAt.getMinutes();
    // Buffer nicht hinzufügen — Booking-Buffer ist schon Teil der "stored endAt"-Logik.
    const blocked: TimeWindow = {
      start: Math.max(0, startMin - cfg.bufferBeforeMin),
      end: Math.min(24 * 60, endMin + cfg.bufferAfterMin),
    };
    const arr = otherBusyByDay.get(key);
    if (arr) arr.push(blocked);
    else otherBusyByDay.set(key, [blocked]);
  }

  const availability = await getAvailability(userId, start, rangeEnd);

  const result: DayWithSlots[] = [];
  for (const day of availability) {
    if (!day.isAvailable) {
      result.push({ date: day.date, weekday: day.weekday, hasSlots: false, slots: [] });
      continue;
    }
    // Zusätzlich Booking-Konflikte abziehen
    const extraBusy = otherBusyByDay.get(day.date) ?? [];
    const free = extraBusy.length === 0
      ? day.freeWindows
      : subtractBusy(day.freeWindows, extraBusy);

    const [yStr, moStr, daStr] = day.date.split("-");
    const dayDate = new Date(Number(yStr), Number(moStr) - 1, Number(daStr));

    const totalNeeded = cfg.bufferBeforeMin + cfg.durationMin + cfg.bufferAfterMin;
    const slots: BookableSlot[] = [];
    for (const w of free) {
      if (w.end - w.start < totalNeeded) continue;
      const earliest = w.start + cfg.bufferBeforeMin;
      const latest = w.end - cfg.durationMin - cfg.bufferAfterMin;
      let cur = Math.ceil(earliest / cfg.slotIntervalMin) * cfg.slotIntervalMin;
      while (cur <= latest) {
        const slotStart = new Date(dayDate);
        slotStart.setMinutes(cur);
        if (slotStart >= minLeadAt) {
          const slotEnd = new Date(slotStart.getTime() + cfg.durationMin * 60_000);
          const h = Math.floor(cur / 60);
          const m = cur % 60;
          slots.push({
            startISO: slotStart.toISOString(),
            endISO: slotEnd.toISOString(),
            label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          });
        }
        cur += cfg.slotIntervalMin;
      }
    }

    result.push({ date: day.date, weekday: day.weekday, hasSlots: slots.length > 0, slots });
  }
  return result;
}

// Race-Safe-Check vor dem Persistieren: passt der Slot mit seiner Dauer/Buffer
// noch in ein freies Fenster?
export async function isSlotStillAvailable(
  userId: string,
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

  const dayStart = new Date(startAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const availability = await getAvailability(userId, dayStart, dayEnd);
  const day = availability[0];
  if (!day || !day.isAvailable) {
    return { ok: false, reason: "An diesem Tag werden keine Termine angeboten." };
  }

  // Andere Bookings am selben Tag als zusätzliche Belegung
  const otherBookings = await prisma.booking.findMany({
    where: {
      ownerId: userId,
      status: { not: "CANCELLED" },
      startAt: { gte: dayStart, lt: dayEnd },
    },
    select: { startAt: true, endAt: true },
  });
  const extraBusy: TimeWindow[] = otherBookings.map((b) => {
    const sMin = b.startAt.getHours() * 60 + b.startAt.getMinutes();
    const eMin = b.endAt.getHours() * 60 + b.endAt.getMinutes();
    return {
      start: Math.max(0, sMin - cfg.bufferBeforeMin),
      end: Math.min(24 * 60, eMin + cfg.bufferAfterMin),
    };
  });
  const free = extraBusy.length === 0 ? day.freeWindows : subtractBusy(day.freeWindows, extraBusy);

  const startMin = startAt.getHours() * 60 + startAt.getMinutes();
  const endMin = endAt.getHours() * 60 + endAt.getMinutes();
  const slotStartIncBuffer = startMin - cfg.bufferBeforeMin;
  const slotEndIncBuffer = endMin + cfg.bufferAfterMin;

  const fitsIn = free.some((w) => slotStartIncBuffer >= w.start && slotEndIncBuffer <= w.end);
  if (!fitsIn) return { ok: false, reason: "Dieser Termin ist mittlerweile vergeben." };

  return { ok: true };
}
