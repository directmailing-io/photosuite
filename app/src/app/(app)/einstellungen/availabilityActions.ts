"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseYmd, ymdLocal, hhmmToMinutes } from "@/lib/availability";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
}

// Re-Export für Page-Loader, die explizit Defaults seeden wollen.
// In "use server" dürfen nur async functions exportiert werden — daher Wrapper.
import { ensureWeeklyDefaults as _ensureWeeklyDefaults } from "@/lib/availability";
export async function ensureWeeklyDefaults() {
  await _ensureWeeklyDefaults();
}

function revalidateAll() {
  revalidatePath("/einstellungen");
  revalidatePath("/shootings");
  revalidatePath("/kalender");
}

// Speichert die ganze Wochenregel aus dem Setup-Form. Atomar in einer Transaction —
// sonst könnte ein Mittendrin-Absturz Lisa mit halb-aktualisierten Regeln zurücklassen.
export async function saveWeeklyRules(formData: FormData): Promise<void> {
  await requireSession();
  const upserts = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const raw = formData.get(`weekly.${weekday}.max`);
    const max = Math.max(0, Math.min(10, Number(raw) || 0));
    const startMinutes = hhmmToMinutes(String(formData.get(`weekly.${weekday}.start`) ?? ""));
    const endMinutes = hhmmToMinutes(String(formData.get(`weekly.${weekday}.end`) ?? ""));
    // Wenn End vor Start → beide ignorieren statt komische Daten zu speichern.
    const validRange = startMinutes != null && endMinutes != null && endMinutes > startMinutes;
    upserts.push(
      prisma.availabilityWeekly.upsert({
        where: { weekday },
        create: {
          weekday,
          maxShootings: max,
          startMinutes: validRange ? startMinutes : null,
          endMinutes: validRange ? endMinutes : null,
        },
        update: {
          maxShootings: max,
          startMinutes: validRange ? startMinutes : null,
          endMinutes: validRange ? endMinutes : null,
        },
      }),
    );
  }
  await prisma.$transaction(upserts);
  revalidateAll();
}

// Override anlegen — optional als Date-Range (Bulk-Urlaub). Wenn `dateEnd` gesetzt ist,
// werden alle Tage von `date` bis inkl. `dateEnd` mit denselben Werten angelegt/aktualisiert.
// Wir batchen das in einer Transaction, sonst können wir bei 14-Tage-Urlaub halb-applied stehenbleiben.
export async function upsertOverride(formData: FormData): Promise<void> {
  await requireSession();
  const date = String(formData.get("date") ?? "").trim();
  const dateEnd = String(formData.get("dateEnd") ?? "").trim();
  const start = parseYmd(date);
  if (!start) throw new Error("Ungültiges Datum");
  const end = dateEnd ? parseYmd(dateEnd) : start;
  if (!end) throw new Error("Ungültiges Bis-Datum");
  if (end < start) throw new Error('„Bis"-Datum darf nicht vor dem Startdatum liegen');

  const max = Math.max(0, Math.min(10, Number(formData.get("maxShootings")) || 0));
  const note = String(formData.get("note") ?? "").trim() || null;
  const startMinutes = hhmmToMinutes(String(formData.get("startTime") ?? ""));
  const endMinutes = hhmmToMinutes(String(formData.get("endTime") ?? ""));
  const validRange = startMinutes != null && endMinutes != null && endMinutes > startMinutes;
  const startVal = validRange ? startMinutes : null;
  const endVal = validRange ? endMinutes : null;

  // Datums-Range materialisieren (Cap bei 366 Tagen — schützt vor Fehleingaben)
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
        where: { date: d },
        create: { date: d, maxShootings: max, note, startMinutes: startVal, endMinutes: endVal },
        update: { maxShootings: max, note, startMinutes: startVal, endMinutes: endVal },
      }),
    ),
  );
  revalidateAll();
}

export async function deleteOverride(id: string): Promise<void> {
  await requireSession();
  await prisma.availabilityOverride.delete({ where: { id } });
  revalidateAll();
}

// Click-im-Kalender-Action: Lisa klickt im Kalender auf einen Tag und ändert die
// Verfügbarkeit direkt. Kein Form-State, nur die Werte als Args.
// `maxShootings=null` löscht den Override (zurück zur Wochenregel).
export async function setDayAvailability(
  date: string,
  maxShootings: number | null,
  note: string | null,
): Promise<void> {
  await requireSession();
  if (!parseYmd(date)) throw new Error("Ungültiges Datum");
  if (maxShootings == null) {
    await prisma.availabilityOverride.deleteMany({ where: { date } });
    revalidateAll();
    return;
  }
  const max = Math.max(0, Math.min(10, maxShootings));
  await prisma.availabilityOverride.upsert({
    where: { date },
    create: { date, maxShootings: max, note },
    update: { maxShootings: max, note },
  });
  revalidateAll();
}
