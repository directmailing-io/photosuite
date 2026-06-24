"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

// ---------- Customer Status ----------

export async function createCustomerStatus(formData: FormData) {
  const userId = await requireUserId();
  const label = s(formData.get("label"));
  const color = s(formData.get("color")) ?? "#9F877F";
  if (!label) return;
  const max = await prisma.customerStatus.findFirst({
    where: { ownerId: userId },
    orderBy: { position: "desc" },
  });
  await prisma.customerStatus.upsert({
    where: { ownerId_label: { ownerId: userId, label } },
    create: { ownerId: userId, label, color, position: (max?.position ?? -1) + 1 },
    update: { color },
  });
  revalidatePath("/einstellungen");
}

export async function updateCustomerStatus(id: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.customerStatus.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Status nicht gefunden");
  await prisma.customerStatus.update({
    where: { id: existing.id },
    data: {
      label: s(formData.get("label"))!,
      color: s(formData.get("color")) ?? "#9F877F",
    },
  });
  revalidatePath("/einstellungen");
}

export async function deleteCustomerStatus(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.customerStatus.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Status nicht gefunden");
  await prisma.customer.updateMany({
    where: { statusId: existing.id, ownerId: userId },
    data: { statusId: null },
  });
  await prisma.customerStatus.delete({ where: { id: existing.id } });
  revalidatePath("/einstellungen");
}

// ---------- Shooting Status ----------

export async function createShootingStatus(formData: FormData) {
  const userId = await requireUserId();
  const label = s(formData.get("label"));
  const color = s(formData.get("color")) ?? "#C8102E";
  if (!label) return;
  const max = await prisma.shootingStatus.findFirst({
    where: { ownerId: userId },
    orderBy: { position: "desc" },
  });
  await prisma.shootingStatus.upsert({
    where: { ownerId_label: { ownerId: userId, label } },
    create: { ownerId: userId, label, color, position: (max?.position ?? -1) + 1 },
    update: { color },
  });
  revalidatePath("/einstellungen");
}

export async function updateShootingStatus(id: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.shootingStatus.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Status nicht gefunden");
  await prisma.shootingStatus.update({
    where: { id: existing.id },
    data: {
      label: s(formData.get("label"))!,
      color: s(formData.get("color")) ?? "#C8102E",
      isDone: formData.get("isDone") === "on",
    },
  });
  revalidatePath("/einstellungen");
}

export async function deleteShootingStatus(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.shootingStatus.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Status nicht gefunden");
  await prisma.shooting.updateMany({
    where: { statusId: existing.id, ownerId: userId },
    data: { statusId: null },
  });
  await prisma.shootingStatus.delete({ where: { id: existing.id } });
  revalidatePath("/einstellungen");
}

// ---------- Tags ----------

export async function createTag(formData: FormData) {
  const userId = await requireUserId();
  const label = s(formData.get("label"));
  const color = s(formData.get("color")) ?? "#9F877F";
  if (!label) return;
  await prisma.tag.upsert({
    where: { ownerId_label: { ownerId: userId, label } },
    create: { ownerId: userId, label, color },
    update: { color },
  });
  revalidatePath("/einstellungen");
}

export async function deleteTag(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.tag.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Tag nicht gefunden");
  await prisma.tag.delete({ where: { id: existing.id } });
  revalidatePath("/einstellungen");
}

// ---------- Studio-Profil ----------

export async function updateStudioProfile(formData: FormData) {
  const userId = await requireUserId();
  await prisma.user.update({
    where: { id: userId },
    data: {
      studioName: s(formData.get("studioName")) ?? null,
      studioTagline: s(formData.get("studioTagline")) ?? null,
      studioPhone: s(formData.get("studioPhone")) ?? null,
      studioEmail: s(formData.get("studioEmail")) ?? null,
      studioWebsite: s(formData.get("studioWebsite")) ?? null,
      studioAddress: s(formData.get("studioAddress")) ?? null,
      studioInstagram: s(formData.get("studioInstagram")) ?? null,
    },
  });
  revalidatePath("/einstellungen");
}

// ---------- Studio-Logo ----------

export async function saveStudioLogo(args: {
  logoUrl: string;          // gecropptes / fertiges Logo
  logoOriginalUrl: string;  // ungecroppte Original-Datei
  mimeType: string;         // image/svg+xml | image/png | image/jpeg
}) {
  const userId = await requireUserId();
  await prisma.user.update({
    where: { id: userId },
    data: {
      logoUrl: args.logoUrl,
      logoOriginalUrl: args.logoOriginalUrl,
      logoMimeType: args.mimeType,
    },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/k", "layout");
}

export async function removeStudioLogo() {
  const userId = await requireUserId();
  await prisma.user.update({
    where: { id: userId },
    data: { logoUrl: null, logoOriginalUrl: null, logoMimeType: null },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/k", "layout");
}
