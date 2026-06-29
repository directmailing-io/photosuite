"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID_CATEGORIES = new Set(["ALLGEMEIN", "ERSTGESPRAECH", "BILDAUSWAHL", "RETUSCHE"]);

function safeCategory(raw: FormDataEntryValue | null): string {
  const v = String(raw ?? "").trim();
  return VALID_CATEGORIES.has(v) ? v : "ALLGEMEIN";
}

function safeString(raw: FormDataEntryValue | null, fallback = ""): string {
  const v = String(raw ?? "").trim();
  return v.length > 0 ? v : fallback;
}

export async function createNoteTemplate(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const name = safeString(formData.get("name"));
  const body = safeString(formData.get("body"));
  if (!name) throw new Error("Name der Vorlage ist Pflicht.");
  if (!body) throw new Error("Body ist Pflicht.");
  const category = safeCategory(formData.get("category"));

  const max = await prisma.noteTemplate.findFirst({
    where: { ownerId: userId, category },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.noteTemplate.create({
    data: {
      ownerId: userId,
      name: name.slice(0, 80),
      category,
      body: body.slice(0, 4000),
      position: (max?.position ?? -1) + 1,
    },
  });
  revalidatePath("/einstellungen");
}

export async function updateNoteTemplate(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.noteTemplate.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Vorlage nicht gefunden");
  const name = safeString(formData.get("name"), existing.name);
  const body = safeString(formData.get("body"), existing.body);
  const category = safeCategory(formData.get("category"));
  await prisma.noteTemplate.update({
    where: { id },
    data: {
      name: name.slice(0, 80),
      body: body.slice(0, 4000),
      category,
    },
  });
  revalidatePath("/einstellungen");
}

export async function deleteNoteTemplate(id: string): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.noteTemplate.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) return;
  await prisma.noteTemplate.delete({ where: { id } });
  revalidatePath("/einstellungen");
}
