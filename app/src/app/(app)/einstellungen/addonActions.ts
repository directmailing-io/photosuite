"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { saveUpload } from "@/lib/upload";

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
  const userId = await requireUserId();
  const name = s(formData.get("name"));
  const price = num(formData.get("price"));
  if (!name) throw new Error("Name ist Pflicht");
  if (price == null || price < 0) throw new Error("Preis ist Pflicht");

  // Optional: Bild-Upload — Fehler hier sollen klar verständlich beim User landen.
  const file = formData.get("image") as File | null;
  let imageUrl: string | undefined;
  let imageMimeType: string | undefined;
  if (file && file.size > 0) {
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      throw new Error(`Dieses Bildformat geht nicht (${file.type || "unbekannt"}). Erlaubt: PNG, JPG, SVG, WEBP.`);
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error(`Das Bild ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximal 5 MB.`);
    }
    try {
      const res = await saveUpload(file, "addons");
      imageUrl = res.url;
      imageMimeType = file.type;
    } catch (err: any) {
      throw new Error(`Bild konnte nicht hochgeladen werden: ${err?.message ?? "Unbekannter Fehler"}`);
    }
  }

  const last = await prisma.addon.findFirst({
    where: { ownerId: userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  try {
    await prisma.addon.create({
      data: {
        ownerId: userId,
        name,
        description: s(formData.get("description")),
        price,
        isActive: formData.get("isActive") === "on",
        position: (last?.position ?? -1) + 1,
        imageUrl,
        imageOriginalUrl: imageUrl,
        imageMimeType,
      },
    });
  } catch (err: any) {
    throw new Error(`Datenbank-Fehler beim Anlegen: ${err?.message ?? "Unbekannt"}`);
  }
  revalidatePath("/einstellungen");
  revalidatePath("/pakete");
  revalidatePath("/shootings");
}

export async function updateAddon(id: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.addon.findFirst({ where: { id, ownerId: userId } });
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
    where: { id: existing.id },
    data: {
      name: s(formData.get("name")) ?? existing.name,
      description: s(formData.get("description")) ?? null,
      price: num(formData.get("price")) ?? existing.price,
      isActive: formData.get("isActive") === "on",
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
  const userId = await requireUserId();
  const existing = await prisma.addon.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
  if (!existing) throw new Error("Add-On nicht gefunden");
  // Wenn das Add-On bereits in Shootings gebucht ist, würde ein Hard-Delete den
  // Restrict-FK-Trigger der ShootingAddon-Tabelle werfen und Buchungshistorie zerstören.
  // Stattdessen: soft-deaktivieren und Hinweis geben.
  const inUse = await prisma.shootingAddon.count({ where: { addonId: existing.id } });
  if (inUse > 0) {
    await prisma.addon.update({ where: { id: existing.id }, data: { isActive: false } });
    revalidatePath("/einstellungen");
    revalidatePath("/pakete");
    revalidatePath("/shootings");
    throw new Error(
      `In ${inUse} ${inUse === 1 ? "Shooting" : "Shootings"} gebucht — als „inaktiv" markiert, statt zu löschen.`,
    );
  }
  await prisma.addon.delete({ where: { id: existing.id } });
  revalidatePath("/einstellungen");
  revalidatePath("/pakete");
  revalidatePath("/shootings");
}

export async function toggleAddonActive(id: string, isActive: boolean): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.addon.findFirst({ where: { id, ownerId: userId }, select: { id: true } });
  if (!existing) throw new Error("Add-On nicht gefunden");
  await prisma.addon.update({ where: { id: existing.id }, data: { isActive } });
  revalidatePath("/einstellungen");
  revalidatePath("/pakete");
  revalidatePath("/shootings");
}
