"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID_KINDS = new Set(["SERVICE", "PRODUCT"]);

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function num(v: FormDataEntryValue | null): number | null {
  const str = s(v);
  if (!str) return null;
  const n = Number(String(str).replace(",", "."));
  return isNaN(n) ? null : n;
}

function priceCents(v: FormDataEntryValue | null): number {
  const n = num(v);
  if (n == null) return 0;
  return Math.max(0, Math.round(n * 100));
}

function safeKind(v: FormDataEntryValue | null): "SERVICE" | "PRODUCT" {
  const k = s(v);
  return k === "PRODUCT" ? "PRODUCT" : "SERVICE";
}

export async function createArticle(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const name = s(formData.get("name"));
  if (!name) throw new Error("Name ist Pflicht.");
  const kind = safeKind(formData.get("kind"));
  const max = await prisma.articleCatalog.findFirst({
    where: { ownerId: userId, kind },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.articleCatalog.create({
    data: {
      ownerId: userId,
      name: name.slice(0, 200),
      description: s(formData.get("description"))?.slice(0, 1000) ?? null,
      kind,
      unit: s(formData.get("unit"))?.slice(0, 30) ?? "Pauschal",
      defaultPriceCents: priceCents(formData.get("defaultPrice")),
      position: (max?.position ?? -1) + 1,
      isActive: true,
    },
  });
  revalidatePath("/einstellungen");
}

export async function updateArticle(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.articleCatalog.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Artikel nicht gefunden");
  await prisma.articleCatalog.update({
    where: { id },
    data: {
      name: s(formData.get("name"))?.slice(0, 200) ?? existing.name,
      description: s(formData.get("description"))?.slice(0, 1000) ?? null,
      kind: safeKind(formData.get("kind")),
      unit: s(formData.get("unit"))?.slice(0, 30) ?? existing.unit,
      defaultPriceCents: priceCents(formData.get("defaultPrice")),
      isActive: formData.get("isActive") === "on",
    },
  });
  revalidatePath("/einstellungen");
}

export async function deleteArticle(id: string): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.articleCatalog.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) return;
  await prisma.articleCatalog.delete({ where: { id } });
  revalidatePath("/einstellungen");
}
