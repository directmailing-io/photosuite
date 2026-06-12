"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { saveUpload } from "@/lib/upload";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
}

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

function num(v: FormDataEntryValue | null): number | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const n = Number(String(str).replace(",", "."));
  return isNaN(n) ? undefined : n;
}

export async function createAddon(formData: FormData) {
  await requireSession();
  const name = s(formData.get("name"));
  const price = num(formData.get("price"));
  if (!name) throw new Error("Name ist Pflicht");
  if (price == null || price < 0) throw new Error("Preis ist Pflicht");

  // Optional: Bild-Upload
  const file = formData.get("image") as File | null;
  let imageUrl: string | undefined;
  let imageMimeType: string | undefined;
  if (file && file.size > 0) {
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) throw new Error("Bildformat nicht unterstützt");
    const res = await saveUpload(file, "addons");
    imageUrl = res.url;
    imageMimeType = file.type;
  }

  const last = await prisma.addon.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.addon.create({
    data: {
      name,
      description: s(formData.get("description")),
      price,
      isActive: formData.get("isActive") !== "off",
      position: (last?.position ?? -1) + 1,
      imageUrl,
      imageOriginalUrl: imageUrl,
      imageMimeType,
    },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/pakete");
  revalidatePath("/shootings");
}

export async function updateAddon(id: string, formData: FormData) {
  await requireSession();
  const existing = await prisma.addon.findUnique({ where: { id } });
  if (!existing) throw new Error("Add-On nicht gefunden");

  const file = formData.get("image") as File | null;
  let imageUrl = existing.imageUrl;
  let imageOriginalUrl = existing.imageOriginalUrl;
  let imageMimeType = existing.imageMimeType;
  if (file && file.size > 0) {
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) throw new Error("Bildformat nicht unterstützt");
    const res = await saveUpload(file, "addons");
    imageUrl = res.url;
    imageOriginalUrl = res.url;
    imageMimeType = file.type;
  }
  // Bild entfernen
  if (formData.get("removeImage") === "1") {
    imageUrl = null;
    imageOriginalUrl = null;
    imageMimeType = null;
  }

  await prisma.addon.update({
    where: { id },
    data: {
      name: s(formData.get("name")) ?? existing.name,
      description: s(formData.get("description")) ?? null,
      price: num(formData.get("price")) ?? existing.price,
      isActive: formData.get("isActive") !== "off",
      imageUrl,
      imageOriginalUrl,
      imageMimeType,
    },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/pakete");
  revalidatePath("/shootings");
}

export async function deleteAddon(id: string): Promise<void> {
  await requireSession();
  await prisma.addon.delete({ where: { id } });
  revalidatePath("/einstellungen");
  revalidatePath("/pakete");
  revalidatePath("/shootings");
}
