"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID = new Set(["lisa", "studio", "midnight"]);

export async function setUserTheme(theme: string): Promise<void> {
  if (!VALID.has(theme)) throw new Error("Ungültiges Theme");
  const userId = await requireUserId();
  await prisma.user.update({ where: { id: userId }, data: { theme } });
  // Layout liest theme — komplette App refreshen.
  revalidatePath("/", "layout");
}
