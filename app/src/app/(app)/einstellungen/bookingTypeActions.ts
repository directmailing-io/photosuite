"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
}

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

function num(v: FormDataEntryValue | null, fallback = 0): number {
  const str = s(v);
  if (str == null) return fallback;
  const n = Number(String(str).replace(",", "."));
  return isNaN(n) ? fallback : n;
}

// JSON-Felder aus FormData lesen + sanity-checken. Bei ungültigem JSON: null.
function jsonField(v: FormDataEntryValue | null): string | null {
  const str = s(v);
  if (!str) return null;
  try {
    JSON.parse(str);
    return str;
  } catch {
    return null;
  }
}

// Slug-Sanitizer: aus „Erstgespräch 30 Min" wird „erstgespraech-30-min".
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function ensureUniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base || "termin";
  let counter = 1;
  while (true) {
    const existing = await prisma.bookingType.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    counter++;
    slug = `${base}-${counter}`;
  }
}

function revalidateAll() {
  revalidatePath("/einstellungen");
  revalidatePath("/buchungen");
}

export async function createBookingType(formData: FormData): Promise<{ id: string; slug: string }> {
  await requireSession();
  const name = s(formData.get("name"));
  if (!name) throw new Error("Name ist Pflicht");
  const customSlug = s(formData.get("slug"));
  const slug = await ensureUniqueSlug(slugify(customSlug || name));
  const last = await prisma.bookingType.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  const created = await prisma.bookingType.create({
    data: {
      slug,
      name,
      description: s(formData.get("description")),
      durationMin: Math.max(5, Math.min(720, num(formData.get("durationMin"), 30))),
      // Termine sind aktuell immer kostenlos. Falls Bezahl-Buchung kommt, hier
      // wieder Form-Wert lesen.
      priceCents: 0,
      bufferBeforeMin: Math.max(0, Math.min(240, num(formData.get("bufferBeforeMin"), 0))),
      bufferAfterMin: Math.max(0, Math.min(240, num(formData.get("bufferAfterMin"), 15))),
      minLeadHours: Math.max(0, Math.min(168, num(formData.get("minLeadHours"), 24))),
      maxAheadDays: Math.max(1, Math.min(365, num(formData.get("maxAheadDays"), 60))),
      slotIntervalMin: Math.max(5, Math.min(120, num(formData.get("slotIntervalMin"), 30))),
      location: s(formData.get("location")) ?? null,
      locationsJson: jsonField(formData.get("locationsJson")),
      requiredFieldsJson: jsonField(formData.get("requiredFieldsJson")),
      videoProvider: (() => {
        const v = s(formData.get("videoProvider"));
        if (!v) return null;
        return ["zoom", "google_meet", "teams", "whereby", "manual"].includes(v) ? v : null;
      })(),
      autoConfirm: formData.get("autoConfirm") === "on",
      requirePhone: formData.get("requirePhone") === "on",
      requireMessage: formData.get("requireMessage") === "on",
      color: s(formData.get("color")) ?? "#9F877F",
      isActive: formData.get("isActive") === "on",
      position: (last?.position ?? -1) + 1,
    },
  });
  revalidateAll();
  return { id: created.id, slug: created.slug };
}

export async function updateBookingType(id: string, formData: FormData): Promise<void> {
  await requireSession();
  const existing = await prisma.bookingType.findUnique({ where: { id } });
  if (!existing) throw new Error("Buchungstyp nicht gefunden");
  const name = s(formData.get("name")) ?? existing.name;
  const customSlug = s(formData.get("slug"));
  const desiredSlug = customSlug ? slugify(customSlug) : existing.slug;
  const slug = desiredSlug === existing.slug
    ? existing.slug
    : await ensureUniqueSlug(desiredSlug, id);
  await prisma.bookingType.update({
    where: { id },
    data: {
      slug,
      name,
      description: s(formData.get("description")) ?? null,
      durationMin: Math.max(5, Math.min(720, num(formData.get("durationMin"), existing.durationMin))),
      priceCents: 0,
      bufferBeforeMin: Math.max(0, Math.min(240, num(formData.get("bufferBeforeMin"), existing.bufferBeforeMin))),
      bufferAfterMin: Math.max(0, Math.min(240, num(formData.get("bufferAfterMin"), existing.bufferAfterMin))),
      minLeadHours: Math.max(0, Math.min(168, num(formData.get("minLeadHours"), existing.minLeadHours))),
      maxAheadDays: Math.max(1, Math.min(365, num(formData.get("maxAheadDays"), existing.maxAheadDays))),
      slotIntervalMin: Math.max(5, Math.min(120, num(formData.get("slotIntervalMin"), existing.slotIntervalMin))),
      location: s(formData.get("location")) ?? null,
      locationsJson: jsonField(formData.get("locationsJson")),
      requiredFieldsJson: jsonField(formData.get("requiredFieldsJson")),
      videoProvider: (() => {
        const v = s(formData.get("videoProvider"));
        if (!v) return null;
        return ["zoom", "google_meet", "teams", "whereby", "manual"].includes(v) ? v : null;
      })(),
      autoConfirm: formData.get("autoConfirm") === "on",
      requirePhone: formData.get("requirePhone") === "on",
      requireMessage: formData.get("requireMessage") === "on",
      color: s(formData.get("color")) ?? existing.color,
      isActive: formData.get("isActive") === "on",
    },
  });
  revalidateAll();
}

export async function deleteBookingType(id: string): Promise<void> {
  await requireSession();
  const inUse = await prisma.booking.count({ where: { bookingTypeId: id, status: { not: "CANCELLED" } } });
  if (inUse > 0) {
    await prisma.bookingType.update({ where: { id }, data: { isActive: false } });
    revalidateAll();
    throw new Error(`${inUse} aktive ${inUse === 1 ? "Buchung" : "Buchungen"} — Typ als inaktiv markiert statt gelöscht.`);
  }
  await prisma.bookingType.delete({ where: { id } });
  revalidateAll();
}
