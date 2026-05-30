"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

// ---------- Customer Status ----------

export async function createCustomerStatus(formData: FormData) {
  const label = s(formData.get("label"));
  const color = s(formData.get("color")) ?? "#9F877F";
  if (!label) return;
  const max = await prisma.customerStatus.findFirst({ orderBy: { position: "desc" } });
  await prisma.customerStatus.create({
    data: { label, color, position: (max?.position ?? -1) + 1 },
  });
  revalidatePath("/einstellungen");
}

export async function updateCustomerStatus(id: string, formData: FormData) {
  await prisma.customerStatus.update({
    where: { id },
    data: {
      label: s(formData.get("label"))!,
      color: s(formData.get("color")) ?? "#9F877F",
    },
  });
  revalidatePath("/einstellungen");
}

export async function deleteCustomerStatus(id: string) {
  await prisma.customer.updateMany({ where: { statusId: id }, data: { statusId: null } });
  await prisma.customerStatus.delete({ where: { id } });
  revalidatePath("/einstellungen");
}

// ---------- Shooting Status ----------

export async function createShootingStatus(formData: FormData) {
  const label = s(formData.get("label"));
  const color = s(formData.get("color")) ?? "#C8102E";
  if (!label) return;
  const max = await prisma.shootingStatus.findFirst({ orderBy: { position: "desc" } });
  await prisma.shootingStatus.create({
    data: { label, color, position: (max?.position ?? -1) + 1 },
  });
  revalidatePath("/einstellungen");
}

export async function updateShootingStatus(id: string, formData: FormData) {
  await prisma.shootingStatus.update({
    where: { id },
    data: {
      label: s(formData.get("label"))!,
      color: s(formData.get("color")) ?? "#C8102E",
      isDone: formData.get("isDone") === "on",
    },
  });
  revalidatePath("/einstellungen");
}

export async function deleteShootingStatus(id: string) {
  await prisma.shooting.updateMany({ where: { statusId: id }, data: { statusId: null } });
  await prisma.shootingStatus.delete({ where: { id } });
  revalidatePath("/einstellungen");
}

// ---------- Tags ----------

export async function createTag(formData: FormData) {
  const label = s(formData.get("label"));
  const color = s(formData.get("color")) ?? "#9F877F";
  if (!label) return;
  await prisma.tag.create({ data: { label, color } });
  revalidatePath("/einstellungen");
}

export async function deleteTag(id: string) {
  await prisma.tag.delete({ where: { id } });
  revalidatePath("/einstellungen");
}

// ---------- Studio-Profil ----------

export async function updateStudioProfile(formData: FormData) {
  const { auth } = await import("@/lib/auth");
  const { loadCurrentUser } = await import("@/lib/loadUser");
  const session = await auth();
  const user = await loadCurrentUser(session);
  if (!user) throw new Error("Nicht angemeldet");

  await prisma.user.update({
    where: { id: user.id },
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
  const { auth } = await import("@/lib/auth");
  const { loadCurrentUser } = await import("@/lib/loadUser");
  const session = await auth();
  const user = await loadCurrentUser(session);
  if (!user) throw new Error("Nicht angemeldet");
  await prisma.user.update({
    where: { id: user.id },
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
  const { auth } = await import("@/lib/auth");
  const { loadCurrentUser } = await import("@/lib/loadUser");
  const session = await auth();
  const user = await loadCurrentUser(session);
  if (!user) throw new Error("Nicht angemeldet");
  await prisma.user.update({
    where: { id: user.id },
    data: { logoUrl: null, logoOriginalUrl: null, logoMimeType: null },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/k", "layout");
}
