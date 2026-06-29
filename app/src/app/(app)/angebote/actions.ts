"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { centsFromInput } from "@/lib/money";
import { computeTotals } from "@/lib/invoice/calc";
import { nextOfferNumber } from "@/lib/invoiceNumber";
import { generateUrlToken } from "@/lib/crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { IssuerSnapshot } from "@/lib/invoiceSnapshot";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}
function dt(v: FormDataEntryValue | null): Date | null | undefined {
  if (v == null) return undefined;
  const str = String(v).trim();
  if (!str) return null;
  return new Date(str);
}
function num(v: FormDataEntryValue | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

async function snapshotFromUser(userId: string): Promise<IssuerSnapshot> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new Error("User nicht gefunden");
  return {
    companyName: u.invoiceCompanyName ?? u.studioName ?? u.name,
    owner: u.invoiceCompanyOwner,
    street: u.invoiceStreet,
    zip: u.invoiceZip,
    city: u.invoiceCity,
    country: u.invoiceCountry,
    taxId: u.invoiceTaxId,
    vatId: u.invoiceVatId,
    isSmallBusiness: u.isSmallBusiness,
    bankName: u.invoiceBankName,
    accountName: u.invoiceBankAccountName,
    iban: u.invoiceIban,
    bic: u.invoiceBic,
    email: u.invoiceEmail ?? u.studioEmail,
    phone: u.studioPhone,
    footerNote: u.invoiceFooterNote,
    logoUrl: u.logoUrl,
    logoMimeType: u.logoMimeType,
  };
}

/**
 * Legt einen neuen Angebots-Entwurf an. Kunde ist Pflicht, Shooting optional.
 * Empfänger-Adresse wird aus dem Kunden vor-befüllt.
 */
export async function createDraftOffer(opts: { customerId: string; shootingId?: string }): Promise<void> {
  const userId = await requireUserId();
  const customer = await prisma.customer.findFirst({
    where: { id: opts.customerId, ownerId: userId },
  });
  if (!customer) throw new Error("Kunde nicht gefunden");

  const shooting = opts.shootingId
    ? await prisma.shooting.findFirst({
        where: { id: opts.shootingId, ownerId: userId },
        include: { package: true },
      })
    : null;
  if (opts.shootingId && !shooting) throw new Error("Shooting nicht gefunden");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const issuer = await snapshotFromUser(userId);

  const recipientName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  const recipientAddress = [
    customer.billingStreet,
    [customer.billingZip, customer.billingCity].filter(Boolean).join(" "),
    customer.billingCountry,
  ].filter(Boolean).join("\n");

  // Default-Gültigkeit: 14 Tage
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 14);

  const isKU = !!user?.isSmallBusiness;
  const defaultVat = user?.defaultVatRate ?? 19;

  // Pre-fill mit Paket-Position, falls Shooting+Paket vorhanden
  const items = shooting?.package
    ? [{
        title: shooting.package.name,
        description: shooting.package.description ?? null,
        quantity: 1,
        unit: "Pauschal",
        unitPriceCents: Math.round((shooting.package.price ?? 0) * 100),
        totalCents: Math.round((shooting.package.price ?? 0) * 100),
        position: 0,
      }]
    : [];

  const { subtotalCents, vatAmountCents, totalCents } = computeTotals(
    items as any, isKU ? 0 : defaultVat, isKU,
  );

  const offer = await prisma.offer.create({
    data: {
      customerId: customer.id,
      shootingId: shooting?.id ?? null,
      recipientName,
      recipientAddress,
      issuerSnapshot: JSON.stringify(issuer),
      title: "Angebot",
      issueDate: new Date(),
      validUntil,
      isSmallBusiness: isKU,
      vatRate: isKU ? 0 : defaultVat,
      subtotalCents,
      vatAmountCents,
      totalCents,
      ownerId: userId,
      items: items.length ? { create: items } : undefined,
    },
  });

  revalidatePath("/angebote");
  redirect(`/angebote/${offer.id}`);
}

export async function updateDraftOffer(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({ where: { id, ownerId: userId } });
  if (!offer) throw new Error("Angebot nicht gefunden");
  if (offer.status !== "DRAFT") throw new Error("Nur Entwürfe können bearbeitet werden");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isSmallBusiness = formData.get("isSmallBusiness") === "on";
  const formVatRate = num(formData.get("vatRate"));
  const vatRate = isSmallBusiness
    ? 0
    : (formVatRate && formVatRate > 0 ? formVatRate : (user?.defaultVatRate || 19));

  const titles = formData.getAll("item.title").map(String);
  const descriptions = formData.getAll("item.description").map(String);
  const quantities = formData.getAll("item.quantity").map((v) => Number(String(v).replace(",", ".")));
  const units = formData.getAll("item.unit").map(String);
  const prices = formData.getAll("item.unitPrice").map((v) => centsFromInput(String(v)));

  const items = titles.map((t, i) => ({
    title: t.trim() || "Leistung",
    description: (descriptions[i] ?? "").trim() || null,
    quantity: quantities[i] || 1,
    unit: units[i] || null,
    unitPriceCents: prices[i] || 0,
  }));

  const { subtotalCents, vatAmountCents, totalCents } = computeTotals(items as any, vatRate, isSmallBusiness);

  const issuer = await snapshotFromUser(userId);

  await prisma.$transaction([
    prisma.offerItem.deleteMany({ where: { offerId: id } }),
    prisma.offer.update({
      where: { id },
      data: {
        recipientName: s(formData.get("recipientName")) ?? offer.recipientName,
        recipientAddress: s(formData.get("recipientAddress")) ?? offer.recipientAddress,
        title: s(formData.get("title")) ?? "Angebot",
        intro: s(formData.get("intro")) ?? null,
        notes: s(formData.get("notes")) ?? null,
        internalNote: s(formData.get("internalNote")) ?? null,
        issueDate: dt(formData.get("issueDate")) ?? offer.issueDate,
        validUntil: dt(formData.get("validUntil")) ?? null,
        vatRate,
        isSmallBusiness,
        subtotalCents,
        vatAmountCents,
        totalCents,
        issuerSnapshot: JSON.stringify(issuer),
        items: {
          create: items.map((it, i) => ({
            title: it.title,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPriceCents: it.unitPriceCents,
            totalCents: Math.round(it.quantity * it.unitPriceCents),
            position: i,
          })),
        },
      },
    }),
  ]);

  revalidatePath(`/angebote/${id}`);
}

/**
 * Versendet das Angebot: vergibt eine Nummer, setzt Status auf SENT,
 * erzeugt einen Public-Token. Nach Issue ist das Angebot immutable.
 */
export async function issueOffer(id: string): Promise<void> {
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({
    where: { id, ownerId: userId },
    include: { items: true },
  });
  if (!offer) throw new Error("Angebot nicht gefunden");
  if (offer.status !== "DRAFT") throw new Error("Angebot wurde bereits versendet.");
  if (offer.items.length === 0) throw new Error("Mindestens eine Position erforderlich");

  const number = await nextOfferNumber(userId);
  const publicToken = offer.publicToken ?? generateUrlToken();

  await prisma.offer.update({
    where: { id },
    data: { number, status: "SENT", sentAt: new Date(), publicToken },
  });

  revalidatePath(`/angebote/${id}`);
  revalidatePath("/angebote");
}

/**
 * Setzt das Angebot zurück nach DRAFT (z.B. wenn Lisa es zurückziehen will,
 * solange die Kundin noch nicht reagiert hat). Nummer + Token bleiben erhalten
 * für die Audit-Spur.
 */
export async function withdrawOffer(id: string): Promise<void> {
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({ where: { id, ownerId: userId } });
  if (!offer) throw new Error("Angebot nicht gefunden");
  if (offer.status !== "SENT" && offer.status !== "EXPIRED") {
    throw new Error("Nur versendete oder abgelaufene Angebote können zurückgezogen werden.");
  }
  await prisma.offer.update({
    where: { id },
    data: { status: "WITHDRAWN" },
  });
  revalidatePath(`/angebote/${id}`);
  revalidatePath("/angebote");
}

/**
 * Studio-Variante: Lisa markiert das Angebot manuell als angenommen
 * (z.B. wenn die Kundin per Telefon/WhatsApp zugesagt hat).
 */
export async function markOfferAccepted(id: string): Promise<void> {
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({ where: { id, ownerId: userId } });
  if (!offer) throw new Error("Angebot nicht gefunden");
  if (offer.status === "ACCEPTED") return;
  if (offer.status === "DRAFT") throw new Error("Angebot muss erst versendet werden.");
  await prisma.offer.update({
    where: { id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  revalidatePath(`/angebote/${id}`);
  revalidatePath("/angebote");
}

export async function markOfferDeclined(id: string, reason?: string): Promise<void> {
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({ where: { id, ownerId: userId } });
  if (!offer) throw new Error("Angebot nicht gefunden");
  if (offer.status === "DRAFT") throw new Error("Angebot muss erst versendet werden.");
  await prisma.offer.update({
    where: { id },
    data: {
      status: "DECLINED",
      declinedAt: new Date(),
      declineReason: reason?.trim() || null,
    },
  });
  revalidatePath(`/angebote/${id}`);
  revalidatePath("/angebote");
}

export async function deleteOfferDraft(id: string): Promise<void> {
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({ where: { id, ownerId: userId } });
  if (!offer) throw new Error("Angebot nicht gefunden");
  if (offer.status !== "DRAFT") {
    throw new Error("Nur Entwürfe können gelöscht werden — versendete Angebote bitte zurückziehen.");
  }
  await prisma.offer.delete({ where: { id } });
  revalidatePath("/angebote");
  redirect("/angebote");
}

/**
 * Konvertiert ein angenommenes Angebot in einen Rechnungs-Entwurf.
 * Items werden 1:1 kopiert, Beträge werden neu berechnet (sollten identisch sein).
 * Verlinkt die Rechnung zurück ins Angebot (convertedInvoiceId).
 */
export async function convertOfferToInvoice(id: string): Promise<void> {
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({
    where: { id, ownerId: userId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!offer) throw new Error("Angebot nicht gefunden");
  if (offer.status !== "ACCEPTED") {
    throw new Error("Nur angenommene Angebote können in Rechnungen konvertiert werden.");
  }
  if (offer.convertedInvoiceId) {
    redirect(`/buchhaltung/${offer.convertedInvoiceId}`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const dueDays = user?.invoicePaymentDueDays ?? 14;
  const now = new Date();
  const dueDate = new Date(now.getTime() + dueDays * 86400_000);

  const invoice = await prisma.invoice.create({
    data: {
      customerId: offer.customerId,
      shootingId: offer.shootingId,
      kind: "FINAL",
      status: "DRAFT",
      recipientName: offer.recipientName,
      recipientAddress: offer.recipientAddress,
      issuerSnapshot: offer.issuerSnapshot,
      issueDate: now,
      dueDate,
      subtotalCents: offer.subtotalCents,
      vatRate: offer.vatRate,
      vatAmountCents: offer.vatAmountCents,
      totalCents: offer.totalCents,
      prepaidCents: 0,
      amountDueCents: offer.totalCents,
      isSmallBusiness: offer.isSmallBusiness,
      ownerId: userId,
      items: {
        create: offer.items.map((it, i) => ({
          title: it.title,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unitPriceCents: it.unitPriceCents,
          totalCents: it.totalCents,
          position: i,
        })),
      },
    },
  });

  await prisma.offer.update({
    where: { id },
    data: { convertedInvoiceId: invoice.id },
  });

  revalidatePath(`/angebote/${id}`);
  revalidatePath("/buchhaltung");
  redirect(`/buchhaltung/${invoice.id}`);
}

/**
 * Wird über Public-Page /k/o/[token] aufgerufen — die Kundin nimmt das Angebot
 * an. Kein Auth, Zugang via unguessable Token.
 */
export async function publicAcceptOffer(token: string): Promise<{ ok: boolean; message?: string }> {
  const offer = await prisma.offer.findFirst({ where: { publicToken: token } });
  if (!offer) return { ok: false, message: "Angebot nicht gefunden." };
  if (offer.status === "ACCEPTED") return { ok: true };
  if (offer.status !== "SENT") return { ok: false, message: "Dieses Angebot ist nicht mehr aktiv." };
  if (offer.validUntil && offer.validUntil < new Date()) {
    return { ok: false, message: "Das Angebot ist leider abgelaufen." };
  }
  await prisma.offer.update({
    where: { id: offer.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  revalidatePath(`/angebote/${offer.id}`);
  return { ok: true };
}

export async function publicDeclineOffer(token: string, reason?: string): Promise<{ ok: boolean; message?: string }> {
  const offer = await prisma.offer.findFirst({ where: { publicToken: token } });
  if (!offer) return { ok: false, message: "Angebot nicht gefunden." };
  if (offer.status === "DECLINED") return { ok: true };
  if (offer.status !== "SENT") return { ok: false, message: "Dieses Angebot ist nicht mehr aktiv." };
  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      status: "DECLINED",
      declinedAt: new Date(),
      declineReason: reason?.trim()?.slice(0, 1000) || null,
    },
  });
  revalidatePath(`/angebote/${offer.id}`);
  return { ok: true };
}
