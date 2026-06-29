"use server";

import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { createHash } from "crypto";

const MAX_PER_HOUR = 5;
const VALID_SYSTEM_KEYS = new Set(["firstName", "lastName", "email", "phone", "message"]);

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  const t = value.trim();
  return t === "" ? null : t.slice(0, max);
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Submission-Handler für Public-LeadForm.
 * - Honeypot-Check (Bot-Filter)
 * - Rate-Limit pro IP-Hash (max 5 / Std pro Owner)
 * - Validierung der system-Felder + Required-Felder
 * - System-Felder gehen direkt in Lead, Custom-Felder in LeadFieldValue
 * - Triggert lead_created Workflow (wie schon bei der Original-/anfrage/[slug]-Route)
 */
export async function submitPublicLeadForm(
  formId: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  // Bot-Check
  if (String(formData.get("_honeypot") ?? "").trim() !== "") {
    return { ok: true }; // still success für den Bot — wir machen nichts
  }

  const form = await prisma.leadForm.findUnique({
    where: { id: formId },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!form || !form.isActive) {
    return { ok: false, message: "Dieses Formular ist nicht verfügbar." };
  }

  // Rate-Limit
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? hdrs.get("x-real-ip")
    ?? "unknown";
  const ipHash = createHash("sha256").update(`${form.ownerId}:${ip}`).digest("hex").slice(0, 32);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.lead.count({
    where: { ownerId: form.ownerId, ipHash, createdAt: { gte: hourAgo } },
  });
  if (recent >= MAX_PER_HOUR) {
    return { ok: false, message: "Zu viele Anfragen in kurzer Zeit — bitte später erneut versuchen." };
  }

  // Felder einsammeln
  const systemValues: Record<string, string | null> = {};
  const customValues: Array<{ fieldId: string; label: string; value: string; position: number }> = [];

  for (const field of form.fields) {
    const raw = formData.get(`field_${field.id}`);
    let value: string | null = null;
    if (field.type === "consent") {
      const checked = String(raw ?? "").trim() === "on";
      if (field.required && !checked) {
        return { ok: false, message: `Bitte die Pflicht-Zustimmung „${field.label}" bestätigen.` };
      }
      // Consent wird nicht extra gespeichert — Pflicht-Check reicht
      continue;
    }
    if (raw != null) value = String(raw).trim();
    if (value === "") value = null;
    if (field.required && !value) {
      return { ok: false, message: `Bitte fülle das Pflichtfeld „${field.label}" aus.` };
    }
    if (!value) continue;
    // System-Mapping
    if (field.systemKey && VALID_SYSTEM_KEYS.has(field.systemKey)) {
      systemValues[field.systemKey] = value;
    } else {
      customValues.push({
        fieldId: field.id,
        label: field.label,
        value: value.slice(0, 5000),
        position: field.position,
      });
    }
  }

  // Minimum: Email + Vorname zwingend sicherstellen
  const firstName = clip(systemValues.firstName ?? null, 100);
  const email = clip(systemValues.email ?? null, 200);
  if (!firstName) return { ok: false, message: "Bitte gib deinen Vornamen an." };
  if (!email || !isValidEmail(email.toLowerCase())) {
    return { ok: false, message: "Bitte gib eine gültige E-Mail-Adresse an." };
  }

  const lead = await prisma.lead.create({
    data: {
      ownerId: form.ownerId,
      leadFormId: form.id,
      firstName,
      lastName: clip(systemValues.lastName ?? null, 100),
      email: email.toLowerCase(),
      phone: clip(systemValues.phone ?? null, 50),
      message: clip(systemValues.message ?? null, 3000),
      source: `Formular: ${form.name}`,
      ipHash,
      fieldValues: customValues.length > 0 ? {
        create: customValues.map((v) => ({
          fieldId: v.fieldId,
          label: v.label.slice(0, 200),
          value: v.value,
          position: v.position,
        })),
      } : undefined,
    },
  });

  // Workflow-Trigger
  try {
    const { triggerWorkflow } = await import("@/lib/workflow/engine");
    await triggerWorkflow("lead_created", { ownerId: form.ownerId, leadId: lead.id });
  } catch (err: any) {
    console.error(`[submitPublicLeadForm] triggerWorkflow: ${err?.message ?? err}`);
  }

  return { ok: true };
}
