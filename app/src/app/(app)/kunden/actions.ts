"use server";

import { prisma } from "@/lib/prisma";
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
  const customer = await prisma.customer.create({
    data: {
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
      instagram: s(formData.get("instagram")),
      facebook: s(formData.get("facebook")),
      tiktok: s(formData.get("tiktok")),
      website: s(formData.get("website")),
      statusId: s(formData.get("statusId")),
      source: s(formData.get("source")),
      internalNotes: s(formData.get("internalNotes")),
      tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
    },
  });
  await prisma.activity.create({
    data: {
      kind: "customer_created",
      message: `Kunde angelegt: ${firstName} ${lastName}`,
      customerId: customer.id,
    },
  });
  revalidatePath("/kunden");
  redirect(`/kunden/${customer.id}`);
}

export async function updateCustomer(id: string, formData: FormData) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new Error("Kunde nicht gefunden");

  const file = formData.get("avatar") as File | null;
  let avatarUrl: string | undefined;
  if (file && file.size > 0) {
    const r = await saveUpload(file, "avatars");
    avatarUrl = r.url;
  }
  const newStatusId = s(formData.get("statusId"));
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);

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
      instagram: s(formData.get("instagram")) ?? null,
      facebook: s(formData.get("facebook")) ?? null,
      tiktok: s(formData.get("tiktok")) ?? null,
      website: s(formData.get("website")) ?? null,
      statusId: newStatusId ?? null,
      source: s(formData.get("source")) ?? null,
      internalNotes: s(formData.get("internalNotes")) ?? null,
      tags: { set: tagIds.map((id) => ({ id })) },
    },
  });

  if (existing.statusId !== newStatusId) {
    const oldS = existing.statusId
      ? await prisma.customerStatus.findUnique({ where: { id: existing.statusId } })
      : null;
    const newS = newStatusId
      ? await prisma.customerStatus.findUnique({ where: { id: newStatusId } })
      : null;
    await prisma.activity.create({
      data: {
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
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/kunden");
  redirect("/kunden");
}

export async function addCustomerNote(customerId: string, formData: FormData) {
  const text = s(formData.get("text"));
  if (!text) return;
  await prisma.activity.create({
    data: {
      kind: "note_added",
      message: text,
      customerId,
    },
  });
  revalidatePath(`/kunden/${customerId}`);
}

// ---------- Begleitpersonen ----------

export async function createCompanion(customerId: string, formData: FormData) {
  const firstName = s(formData.get("firstName"));
  if (!firstName) throw new Error("Vorname ist Pflicht.");
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
  const c = await prisma.customerCompanion.findUnique({ where: { id } });
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
  const c = await prisma.customerCompanion.findUnique({ where: { id } });
  if (!c) return;
  await prisma.customerCompanion.delete({ where: { id } });
  revalidatePath(`/kunden/${c.customerId}`);
}
