"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { parseYmd } from "@/lib/availability";
import { revalidatePath } from "next/cache";

// 6 vordefinierte Farben (Hex). Hex-Werte werden serverseitig validiert, damit
// kein beliebiger String in die DB kommt.
const ALLOWED_COLORS = new Set([
  "#C8102E", // Bordeaux / Lisa-Akzent
  "#FF5A5F", // Airbnb-Rauschrot
  "#D4A574", // Gold
  "#2F6B3B", // Wald-Grün
  "#3B82F6", // Blau
  "#A855F7", // Magenta/Violett
]);

function validateColor(input: unknown): string {
  if (typeof input !== "string") throw new Error("Farbe fehlt");
  if (!ALLOWED_COLORS.has(input)) throw new Error("Ungültige Farbe");
  return input;
}

function clampLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = input.trim();
  if (t.length === 0) return null;
  return t.slice(0, 60);
}

export async function setShootingPlanDay(args: {
  date: string;        // YYYY-MM-DD
  color: string;       // Hex aus ALLOWED_COLORS
  label?: string | null;
}): Promise<void> {
  const userId = await requireUserId();
  if (!parseYmd(args.date)) throw new Error("Ungültiges Datum");
  const color = validateColor(args.color);
  const label = clampLabel(args.label);

  await prisma.shootingPlanDay.upsert({
    where: { ownerId_date: { ownerId: userId, date: args.date } },
    create: { ownerId: userId, date: args.date, color, label },
    update: { color, label },
  });
  revalidatePath("/kalender");
  revalidatePath("/");
  revalidatePath("/shootings");
}

export async function removeShootingPlanDay(date: string): Promise<void> {
  const userId = await requireUserId();
  if (!parseYmd(date)) throw new Error("Ungültiges Datum");
  await prisma.shootingPlanDay.deleteMany({ where: { ownerId: userId, date } });
  revalidatePath("/kalender");
  revalidatePath("/");
  revalidatePath("/shootings");
}

export const PLAN_DAY_COLORS = Array.from(ALLOWED_COLORS);
