"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseYmd } from "@/lib/availability";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
}

// Initialisiert die Wochenregel mit Defaults (Mo-Sa = 1, So = 0), falls noch keine Rows existieren.
// Idempotent: tut nichts, wenn bereits Rows da sind.
export async function ensureWeeklyDefaults(): Promise<void> {
  const count = await prisma.availabilityWeekly.count();
  if (count > 0) return;
  // 0=So, 1=Mo, ..., 6=Sa
  const defaults = [0, 1, 1, 1, 1, 1, 1];
  await prisma.availabilityWeekly.createMany({
    data: defaults.map((max, weekday) => ({ weekday, maxShootings: max })),
  });
}

// Speichert die ganze Wochenregel aus dem Setup-Form.
// Form-Felder: weekly.0.max ... weekly.6.max
export async function saveWeeklyRules(formData: FormData): Promise<void> {
  await requireSession();
  for (let weekday = 0; weekday < 7; weekday++) {
    const raw = formData.get(`weekly.${weekday}.max`);
    const max = Math.max(0, Math.min(10, Number(raw) || 0));
    await prisma.availabilityWeekly.upsert({
      where: { weekday },
      create: { weekday, maxShootings: max },
      update: { maxShootings: max },
    });
  }
  revalidatePath("/einstellungen");
  revalidatePath("/shootings");
}

export async function upsertOverride(formData: FormData): Promise<void> {
  await requireSession();
  const date = String(formData.get("date") ?? "").trim();
  if (!parseYmd(date)) throw new Error("Ungültiges Datum");
  const max = Math.max(0, Math.min(10, Number(formData.get("maxShootings")) || 0));
  const note = String(formData.get("note") ?? "").trim() || null;
  await prisma.availabilityOverride.upsert({
    where: { date },
    create: { date, maxShootings: max, note },
    update: { maxShootings: max, note },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/shootings");
}

export async function deleteOverride(id: string): Promise<void> {
  await requireSession();
  await prisma.availabilityOverride.delete({ where: { id } });
  revalidatePath("/einstellungen");
  revalidatePath("/shootings");
}
