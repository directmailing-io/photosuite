"use server";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

/**
 * Public-Lead-Submit. Wird aufgerufen, wenn jemand das Anfrage-Formular abschickt.
 *
 * Sicherheit:
 *   - Slug-Auth: ungültiger Slug → Throw
 *   - Honeypot: hidden Feld „website_url" muss leer sein (Bots füllen alles aus)
 *   - Rate-Limit: max 5 Submits / IP-Hash / Stunde pro Owner
 *   - Pflichtfelder server-side validiert
 *   - IP-Hash gespeichert, nicht die IP selber (DSGVO-light)
 */

const MAX_PER_HOUR = 5;

function safeString(v: FormDataEntryValue | null, max = 2000): string | null {
  if (v == null) return null;
  const t = String(v).trim().slice(0, max);
  return t === "" ? null : t;
}

async function hashIp(): Promise<string> {
  const h = headers();
  const ip = (await h).get("x-forwarded-for")?.split(",")[0].trim()
    ?? (await h).get("x-real-ip")
    ?? "anon";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export type LeadSubmitResult = { ok: true } | { ok: false; reason: string };

export async function submitPublicLead(slug: string, formData: FormData): Promise<LeadSubmitResult> {
  // Honeypot — wenn dieses Feld befüllt ist, ist es ein Bot.
  const honeypot = safeString(formData.get("website_url"));
  if (honeypot) return { ok: true }; // schweigend „erfolgreich" antworten

  // Owner via Slug
  const owner = await prisma.user.findUnique({
    where: { leadSlug: slug },
    select: { id: true },
  });
  if (!owner) return { ok: false, reason: "Anfrage-Formular nicht verfügbar." };

  // Pflichtfelder
  const firstName = safeString(formData.get("firstName"), 100);
  const email = safeString(formData.get("email"), 200);
  if (!firstName || !email) {
    return { ok: false, reason: "Bitte Vorname und E-Mail angeben." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "Bitte eine gültige E-Mail-Adresse angeben." };
  }

  // Rate-Limit
  const ipHash = await hashIp();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.lead.count({
    where: { ownerId: owner.id, ipHash, createdAt: { gte: hourAgo } },
  });
  if (recentCount >= MAX_PER_HOUR) {
    return { ok: false, reason: "Zu viele Anfragen in kurzer Zeit. Bitte später nochmal versuchen." };
  }

  const lead = await prisma.lead.create({
    data: {
      ownerId: owner.id,
      firstName,
      lastName: safeString(formData.get("lastName"), 100),
      email: email.toLowerCase(),
      phone: safeString(formData.get("phone"), 50),
      message: safeString(formData.get("message"), 3000),
      packageInterest: safeString(formData.get("packageInterest"), 100),
      preferredDate: safeString(formData.get("preferredDate"), 30),
      source: safeString(formData.get("source"), 100),
      ipHash,
    },
  });

  const { triggerWorkflow } = await import("@/lib/workflow/engine");
  triggerWorkflow("lead_created", {
    ownerId: owner.id,
    leadId: lead.id,
  }).catch((err) => console.error(`[publicCreateLead] triggerWorkflow: ${err?.message ?? err}`));

  return { ok: true };
}
