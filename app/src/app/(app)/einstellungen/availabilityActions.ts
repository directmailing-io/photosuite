"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  parseYmd,
  ymdLocal,
  hhmmToMinutes,
  serializeSlots,
  ensureWeeklyDefaults as _ensureWeeklyDefaults,
  type TimeWindow,
} from "@/lib/availability";

export async function ensureWeeklyDefaults(userId: string) {
  await _ensureWeeklyDefaults(userId);
}

function revalidateAll() {
  revalidatePath("/einstellungen");
  revalidatePath("/shootings");
  revalidatePath("/kalender");
}

// Hilfsfunktion: liest paarweise weekly.<weekday>.slots.<i>.start / .end aus FormData
// und baut ein bereinigtes TimeWindow[]. Ungültige oder doppelte werden verworfen.
function parseWindowsFromForm(fd: FormData, prefix: string): TimeWindow[] {
  const windows: TimeWindow[] = [];
  for (let i = 0; i < 12; i++) {
    const start = hhmmToMinutes(String(fd.get(`${prefix}.${i}.start`) ?? ""));
    const end = hhmmToMinutes(String(fd.get(`${prefix}.${i}.end`) ?? ""));
    if (start == null || end == null || end <= start) continue;
    windows.push({ start, end });
  }
  // Sortieren, überlappende mergen
  windows.sort((a, b) => a.start - b.start);
  const merged: TimeWindow[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  return merged;
}

// Wochenregel: pro Tag isAvailable + slotsJson aus FormData.
// Form-Felder pro Wochentag w (0..6):
//   weekly.<w>.available     "on" | nicht gesetzt
//   weekly.<w>.slots.<i>.start  HH:MM
//   weekly.<w>.slots.<i>.end    HH:MM
//   weekly.<w>.useDefault    "on" → slotsJson=null („ganzer Tag" aus User-Default)
export async function saveWeeklyRules(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const upserts = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const isAvailable = formData.get(`weekly.${weekday}.available`) === "on";
    const useDefault = formData.get(`weekly.${weekday}.useDefault`) === "on";
    let slotsJson: string | null = null;
    if (isAvailable && !useDefault) {
      const windows = parseWindowsFromForm(formData, `weekly.${weekday}.slots`);
      slotsJson = windows.length > 0 ? serializeSlots(windows) : null;
    }
    upserts.push(
      prisma.availabilityWeekly.upsert({
        where: { ownerId_weekday: { ownerId: userId, weekday } },
        create: { ownerId: userId, weekday, isAvailable, slotsJson },
        update: { isAvailable, slotsJson },
      }),
    );
  }
  await prisma.$transaction(upserts);
  revalidateAll();
}

// User-konfigurierbare Preset-Zeiten (Vormittag/Nachmittag/Abend) speichern.
// Validierung: Endzeit muss nach Startzeit, alle innerhalb [0..24h].
export async function savePresetTimes(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  function pair(startKey: string, endKey: string, label: string): [number, number] {
    const s = hhmmToMinutes(String(formData.get(startKey) ?? ""));
    const e = hhmmToMinutes(String(formData.get(endKey) ?? ""));
    if (s == null || e == null) throw new Error(`Bitte gültige Zeit für ${label} eingeben.`);
    if (e <= s) throw new Error(`${label}: Endzeit muss nach der Startzeit liegen.`);
    return [s, e];
  }
  const [morningStart, morningEnd] = pair("morningStart", "morningEnd", "Vormittag");
  const [afternoonStart, afternoonEnd] = pair("afternoonStart", "afternoonEnd", "Nachmittag");
  const [eveningStart, eveningEnd] = pair("eveningStart", "eveningEnd", "Abend");
  await prisma.user.update({
    where: { id: userId },
    data: {
      defaultMorningStart: morningStart,
      defaultMorningEnd: morningEnd,
      defaultAfternoonStart: afternoonStart,
      defaultAfternoonEnd: afternoonEnd,
      defaultEveningStart: eveningStart,
      defaultEveningEnd: eveningEnd,
    },
  });
  revalidateAll();
}

// User-Default-Zeitfenster für „ganzer Tag" speichern.
export async function saveDefaultDayWindow(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const start = hhmmToMinutes(String(formData.get("defaultDayStart") ?? "")) ?? 540;
  const end = hhmmToMinutes(String(formData.get("defaultDayEnd") ?? "")) ?? 1080;
  if (end <= start) throw new Error("Endzeit muss nach der Startzeit liegen");
  await prisma.user.update({
    where: { id: userId },
    data: { defaultDayStartMinutes: start, defaultDayEndMinutes: end },
  });
  revalidateAll();
}

// Tag-Override: optional Date-Range (Bulk).
export async function upsertOverride(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const date = String(formData.get("date") ?? "").trim();
  const dateEnd = String(formData.get("dateEnd") ?? "").trim();
  const start = parseYmd(date);
  if (!start) throw new Error("Ungültiges Datum");
  const end = dateEnd ? parseYmd(dateEnd) : start;
  if (!end) throw new Error("Ungültiges Bis-Datum");
  if (end < start) throw new Error('„Bis"-Datum darf nicht vor dem Startdatum liegen');

  const isAvailable = formData.get("isAvailable") === "on";
  const useDefault = formData.get("useDefault") === "on";
  const note = String(formData.get("note") ?? "").trim() || null;
  let slotsJson: string | null = null;
  if (isAvailable && !useDefault) {
    const windows = parseWindowsFromForm(formData, "slots");
    slotsJson = windows.length > 0 ? serializeSlots(windows) : null;
  }

  const dates: string[] = [];
  const cur = new Date(start);
  let safety = 366;
  while (cur <= end && safety-- > 0) {
    dates.push(ymdLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }

  await prisma.$transaction(
    dates.map((d) =>
      prisma.availabilityOverride.upsert({
        where: { ownerId_date: { ownerId: userId, date: d } },
        create: { ownerId: userId, date: d, isAvailable, slotsJson, note },
        update: { isAvailable, slotsJson, note },
      }),
    ),
  );
  revalidateAll();
}

export async function deleteOverride(id: string): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.availabilityOverride.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) return;
  await prisma.availabilityOverride.delete({ where: { id: existing.id } });
  revalidateAll();
}

// Click-im-Kalender: Tag-Override direkt aus dem Kalender setzen.
// `windows=null` + `isAvailable=true` → User-Default („ganzer Tag").
// `isAvailable=false` → Tag sperren.
// `unset=true` → Override löschen (zurück zur Wochenregel).
export async function setDayAvailability(
  date: string,
  args: {
    isAvailable?: boolean;
    windows?: TimeWindow[] | null;
    note?: string | null;
    unset?: boolean;
  },
): Promise<void> {
  const userId = await requireUserId();
  if (!parseYmd(date)) throw new Error("Ungültiges Datum");
  if (args.unset) {
    await prisma.availabilityOverride.deleteMany({ where: { ownerId: userId, date } });
    revalidateAll();
    return;
  }
  const isAvailable = args.isAvailable ?? false;
  const slotsJson = args.windows && args.windows.length > 0
    ? serializeSlots(args.windows)
    : null;
  await prisma.availabilityOverride.upsert({
    where: { ownerId_date: { ownerId: userId, date } },
    create: { ownerId: userId, date, isAvailable, slotsJson, note: args.note ?? null },
    update: { isAvailable, slotsJson, note: args.note ?? null },
  });
  revalidateAll();
}
