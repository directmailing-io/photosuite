"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_STATUSES = new Set([
  "NEW",
  "CONTACTED",
  "CONSULTATION_BOOKED",
  "CONSULTATION_DONE",
  "CONVERTED",
  "LOST",
]);

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/**
 * Status-Wechsel mit Whitelist. Wird auch beim Convert-Flow indirekt aufgerufen.
 */
export async function setLeadStatus(id: string, status: string): Promise<void> {
  const userId = await requireUserId();
  if (!VALID_STATUSES.has(status)) throw new Error("Ungültiger Status");
  const lead = await prisma.lead.findFirst({ where: { id, ownerId: userId } });
  if (!lead) throw new Error("Lead nicht gefunden");
  await prisma.lead.update({ where: { id }, data: { status } });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

/**
 * Erstgespräch planen + Notizen speichern.
 */
export async function updateLeadConsultation(
  id: string,
  formData: FormData,
): Promise<void> {
  const userId = await requireUserId();
  const lead = await prisma.lead.findFirst({ where: { id, ownerId: userId } });
  if (!lead) throw new Error("Lead nicht gefunden");

  const consultationAtRaw = s(formData.get("consultationAt"));
  const consultationAt = consultationAtRaw ? new Date(consultationAtRaw) : null;

  await prisma.lead.update({
    where: { id },
    data: {
      consultationAt,
      consultationNotes: s(formData.get("consultationNotes")),
      // Wenn ein Datum gesetzt wird und Status noch NEW/CONTACTED → auto BOOKED
      status: consultationAt && (lead.status === "NEW" || lead.status === "CONTACTED")
        ? "CONSULTATION_BOOKED"
        : lead.status,
    },
  });
  revalidatePath(`/leads/${id}`);
}

/**
 * Interne Notizen update.
 */
export async function updateLeadNotes(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const lead = await prisma.lead.findFirst({ where: { id, ownerId: userId } });
  if (!lead) throw new Error("Lead nicht gefunden");
  await prisma.lead.update({
    where: { id },
    data: { internalNotes: s(formData.get("internalNotes")) },
  });
  revalidatePath(`/leads/${id}`);
}

/**
 * Convert: erstellt einen Customer aus dem Lead und verknüpft ihn.
 * Wenn der Caller `existingCustomerId` übergibt, wird kein neuer Customer erstellt
 * (Use-Case: Lisa erkennt einen Bestandskunden und will den verknüpfen).
 *
 * Redirect zur Customer-Edit-Page → Lisa kann gleich Adresse etc. nachpflegen.
 */
export async function convertLeadToCustomer(
  id: string,
  existingCustomerId?: string,
): Promise<void> {
  const userId = await requireUserId();
  const lead = await prisma.lead.findFirst({ where: { id, ownerId: userId } });
  if (!lead) throw new Error("Lead nicht gefunden");
  if (lead.convertedCustomerId) throw new Error("Lead ist bereits konvertiert.");

  let customerId: string;
  if (existingCustomerId) {
    const existing = await prisma.customer.findFirst({
      where: { id: existingCustomerId, ownerId: userId },
      select: { id: true },
    });
    if (!existing) throw new Error("Verknüpfte Kundin nicht gefunden.");
    customerId = existing.id;
  } else {
    const created = await prisma.customer.create({
      data: {
        ownerId: userId,
        firstName: lead.firstName,
        lastName: lead.lastName ?? "",
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        internalNotes: lead.message
          ? `Aus Anfrage:\n${lead.message}${lead.consultationNotes ? `\n\nErstgespräch:\n${lead.consultationNotes}` : ""}`
          : null,
      },
      select: { id: true },
    });
    customerId = created.id;
  }

  await prisma.lead.update({
    where: { id },
    data: { status: "CONVERTED", convertedCustomerId: customerId },
  });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  redirect(`/kunden/${customerId}/bearbeiten`);
}

/**
 * Email-Duplikat-Suche für die Convert-UI.
 */
export async function findCustomerByEmail(email: string): Promise<{ id: string; name: string } | null> {
  const userId = await requireUserId();
  if (!email) return null;
  const customer = await prisma.customer.findFirst({
    where: { ownerId: userId, email: email.toLowerCase() },
    select: { id: true, firstName: true, lastName: true },
  });
  return customer ? { id: customer.id, name: `${customer.firstName} ${customer.lastName}` } : null;
}

export async function deleteLead(id: string): Promise<void> {
  const userId = await requireUserId();
  const lead = await prisma.lead.findFirst({ where: { id, ownerId: userId } });
  if (!lead) throw new Error("Lead nicht gefunden");
  await prisma.lead.delete({ where: { id } });
  revalidatePath("/leads");
  redirect("/leads");
}

/**
 * Speichert den User.leadSlug (für die Public-URL des Anfrage-Formulars).
 * Slug muss URL-safe sein.
 */
export async function setLeadSlug(slug: string): Promise<void> {
  const userId = await requireUserId();
  const cleaned = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  if (cleaned.length < 3) throw new Error("Slug zu kurz (min. 3 Zeichen, nur a-z, 0-9, -)");
  // Conflict-Check
  const taken = await prisma.user.findFirst({
    where: { leadSlug: cleaned, NOT: { id: userId } },
    select: { id: true },
  });
  if (taken) throw new Error("Dieser Slug ist bereits vergeben.");
  await prisma.user.update({ where: { id: userId }, data: { leadSlug: cleaned } });
  revalidatePath("/leads");
  revalidatePath("/einstellungen");
}
