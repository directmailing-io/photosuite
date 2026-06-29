"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { saveUpload } from "@/lib/upload";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}
function dateOrNull(v: FormDataEntryValue | null): Date | null | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export async function createCustomer(formData: FormData) {
  const userId = await requireUserId();
  const firstName = s(formData.get("firstName"));
  const lastName = s(formData.get("lastName"));
  if (!firstName || !lastName) {
    throw new Error("Vor- und Nachname sind Pflicht.");
  }
  const file = formData.get("avatar") as File | null;
  let avatarUrl: string | undefined;
  if (file && file.size > 0) {
    const r = await saveUpload(file, "avatars");
    avatarUrl = r.url;
  }
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  // Tag-Ownership prüfen: nur eigene Tags dürfen verknüpft werden.
  const ownedTags = tagIds.length
    ? await prisma.tag.findMany({ where: { id: { in: tagIds }, ownerId: userId }, select: { id: true } })
    : [];
  const safeTagIds = ownedTags.map((t) => t.id);

  // CustomerStatus-Ownership prüfen, falls statusId mitgegeben.
  const statusId = s(formData.get("statusId"));
  let safeStatusId: string | undefined = undefined;
  if (statusId) {
    const status = await prisma.customerStatus.findFirst({ where: { id: statusId, ownerId: userId } });
    if (status) safeStatusId = status.id;
  }

  const customer = await prisma.customer.create({
    data: {
      ownerId: userId,
      firstName,
      lastName,
      email: s(formData.get("email")),
      phone: s(formData.get("phone")),
      birthday: dateOrNull(formData.get("birthday")) ?? null,
      avatarUrl,
      billingStreet: s(formData.get("billingStreet")),
      billingZip: s(formData.get("billingZip")),
      billingCity: s(formData.get("billingCity")),
      billingCountry: s(formData.get("billingCountry")) ?? "Deutschland",
      // Lieferadressen: leerer String/null = „wie Rechnungsadresse" (Toggle aktiv).
      welcomeStreet: s(formData.get("welcomeStreet")) ?? null,
      welcomeZip: s(formData.get("welcomeZip")) ?? null,
      welcomeCity: s(formData.get("welcomeCity")) ?? null,
      welcomeCountry: s(formData.get("welcomeCountry")) ?? null,
      welcomeNote: s(formData.get("welcomeNote")) ?? null,
      deliveryStreet: s(formData.get("deliveryStreet")) ?? null,
      deliveryZip: s(formData.get("deliveryZip")) ?? null,
      deliveryCity: s(formData.get("deliveryCity")) ?? null,
      deliveryCountry: s(formData.get("deliveryCountry")) ?? null,
      deliveryNote: s(formData.get("deliveryNote")) ?? null,
      instagram: s(formData.get("instagram")),
      facebook: s(formData.get("facebook")),
      tiktok: s(formData.get("tiktok")),
      website: s(formData.get("website")),
      statusId: safeStatusId,
      source: s(formData.get("source")),
      internalNotes: s(formData.get("internalNotes")),
      tags: safeTagIds.length ? { connect: safeTagIds.map((id) => ({ id })) } : undefined,
    },
  });
  await prisma.activity.create({
    data: {
      ownerId: userId,
      kind: "customer_created",
      message: `Kunde angelegt: ${firstName} ${lastName}`,
      customerId: customer.id,
    },
  });
  revalidatePath("/kunden");
  redirect(`/kunden/${customer.id}`);
}

export async function updateCustomer(id: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.customer.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Kunde nicht gefunden");

  const file = formData.get("avatar") as File | null;
  let avatarUrl: string | undefined;
  if (file && file.size > 0) {
    const r = await saveUpload(file, "avatars");
    avatarUrl = r.url;
  }
  const newStatusId = s(formData.get("statusId"));
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);

  // Tag-Ownership prüfen.
  const ownedTags = tagIds.length
    ? await prisma.tag.findMany({ where: { id: { in: tagIds }, ownerId: userId }, select: { id: true } })
    : [];
  const safeTagIds = ownedTags.map((t) => t.id);

  // CustomerStatus-Ownership prüfen.
  let safeNewStatusId: string | null = null;
  if (newStatusId) {
    const status = await prisma.customerStatus.findFirst({ where: { id: newStatusId, ownerId: userId } });
    if (status) safeNewStatusId = status.id;
  }

  await prisma.customer.update({
    where: { id },
    data: {
      firstName: s(formData.get("firstName")) ?? existing.firstName,
      lastName: s(formData.get("lastName")) ?? existing.lastName,
      email: s(formData.get("email")) ?? null,
      phone: s(formData.get("phone")) ?? null,
      birthday: dateOrNull(formData.get("birthday")) ?? null,
      avatarUrl: avatarUrl ?? existing.avatarUrl,
      billingStreet: s(formData.get("billingStreet")) ?? null,
      billingZip: s(formData.get("billingZip")) ?? null,
      billingCity: s(formData.get("billingCity")) ?? null,
      billingCountry: s(formData.get("billingCountry")) ?? null,
      welcomeStreet: s(formData.get("welcomeStreet")) ?? null,
      welcomeZip: s(formData.get("welcomeZip")) ?? null,
      welcomeCity: s(formData.get("welcomeCity")) ?? null,
      welcomeCountry: s(formData.get("welcomeCountry")) ?? null,
      welcomeNote: s(formData.get("welcomeNote")) ?? null,
      deliveryStreet: s(formData.get("deliveryStreet")) ?? null,
      deliveryZip: s(formData.get("deliveryZip")) ?? null,
      deliveryCity: s(formData.get("deliveryCity")) ?? null,
      deliveryCountry: s(formData.get("deliveryCountry")) ?? null,
      deliveryNote: s(formData.get("deliveryNote")) ?? null,
      instagram: s(formData.get("instagram")) ?? null,
      facebook: s(formData.get("facebook")) ?? null,
      tiktok: s(formData.get("tiktok")) ?? null,
      website: s(formData.get("website")) ?? null,
      statusId: safeNewStatusId,
      source: s(formData.get("source")) ?? null,
      internalNotes: s(formData.get("internalNotes")) ?? null,
      tags: { set: safeTagIds.map((id) => ({ id })) },
    },
  });

  if (existing.statusId !== safeNewStatusId) {
    const oldS = existing.statusId
      ? await prisma.customerStatus.findFirst({ where: { id: existing.statusId, ownerId: userId } })
      : null;
    const newS = safeNewStatusId
      ? await prisma.customerStatus.findFirst({ where: { id: safeNewStatusId, ownerId: userId } })
      : null;
    await prisma.activity.create({
      data: {
        ownerId: userId,
        kind: "customer_status_changed",
        message: `Status: ${oldS?.label ?? "—"} → ${newS?.label ?? "—"}`,
        customerId: id,
      },
    });
  }

  revalidatePath(`/kunden/${id}`);
  revalidatePath("/kunden");
}

export async function deleteCustomer(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.customer.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Kunde nicht gefunden");
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/kunden");
  redirect("/kunden");
}

export async function addCustomerNote(customerId: string, formData: FormData) {
  const userId = await requireUserId();
  const text = s(formData.get("text"));
  if (!text) return;
  // Customer-Ownership prüfen, damit keine Notiz an fremde Kundin geschrieben werden kann.
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ownerId: userId } });
  if (!customer) throw new Error("Kunde nicht gefunden");
  await prisma.activity.create({
    data: {
      ownerId: userId,
      kind: "note_added",
      message: text,
      customerId,
    },
  });
  revalidatePath(`/kunden/${customerId}`);
}

// ---------- Begleitpersonen ----------

export async function createCompanion(customerId: string, formData: FormData) {
  const userId = await requireUserId();
  const firstName = s(formData.get("firstName"));
  if (!firstName) throw new Error("Vorname ist Pflicht.");
  // Customer-Ownership prüfen.
  const customer = await prisma.customer.findFirst({ where: { id: customerId, ownerId: userId } });
  if (!customer) throw new Error("Kunde nicht gefunden");
  const lastPosition = await prisma.customerCompanion.findFirst({
    where: { customerId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.customerCompanion.create({
    data: {
      customerId,
      firstName,
      lastName: s(formData.get("lastName")),
      relationship: s(formData.get("relationship")),
      birthday: dateOrNull(formData.get("birthday")) ?? null,
      email: s(formData.get("email")),
      phone: s(formData.get("phone")),
      notes: s(formData.get("notes")),
      position: (lastPosition?.position ?? -1) + 1,
    },
  });
  revalidatePath(`/kunden/${customerId}`);
}

export async function updateCompanion(id: string, formData: FormData) {
  const userId = await requireUserId();
  // Companion via Customer-Ownership absichern.
  const c = await prisma.customerCompanion.findFirst({
    where: { id, customer: { ownerId: userId } },
  });
  if (!c) throw new Error("Person nicht gefunden");
  await prisma.customerCompanion.update({
    where: { id },
    data: {
      firstName: s(formData.get("firstName")) ?? c.firstName,
      lastName: s(formData.get("lastName")) ?? null,
      relationship: s(formData.get("relationship")) ?? null,
      birthday: dateOrNull(formData.get("birthday")) ?? null,
      email: s(formData.get("email")) ?? null,
      phone: s(formData.get("phone")) ?? null,
      notes: s(formData.get("notes")) ?? null,
    },
  });
  revalidatePath(`/kunden/${c.customerId}`);
}

export async function deleteCompanion(id: string) {
  const userId = await requireUserId();
  const c = await prisma.customerCompanion.findFirst({
    where: { id, customer: { ownerId: userId } },
  });
  if (!c) return;
  await prisma.customerCompanion.delete({ where: { id } });
  revalidatePath(`/kunden/${c.customerId}`);
}
