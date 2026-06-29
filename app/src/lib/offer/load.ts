import { prisma } from "@/lib/prisma";
import { parseIssuer } from "@/lib/invoiceSnapshot";
import { loadLogoBuffer } from "@/lib/invoice/load";
import type { OfferForPdf } from "./pdf";

/**
 * Lädt ein Angebot komplett für die PDF-Generierung — inklusive Logo-Buffer und
 * dem aktuellen invoiceDesign des Users.
 *
 * Tenant-Check passiert auf der API-Route-Ebene (oder via Public-Token bei der
 * Kundinnen-Variante). Diese Funktion erwartet eine vorvalidierte offer-ID.
 */
export async function loadOfferForPdf(offerId: string): Promise<OfferForPdf | null> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!offer) return null;

  const issuer = parseIssuer(offer.issuerSnapshot);
  // Logo-Fallback: wenn der Issuer-Snapshot kein Logo hat, vom User holen.
  let logoUrl = issuer.logoUrl;
  let logoMime = issuer.logoMimeType;
  const owner = await prisma.user.findUnique({
    where: { id: offer.ownerId },
    select: { logoUrl: true, logoMimeType: true, invoiceDesign: true },
  });
  if (!logoUrl && owner?.logoUrl) {
    logoUrl = owner.logoUrl;
    logoMime = owner.logoMimeType;
  }
  const logo = await loadLogoBuffer(logoUrl, logoMime);

  return {
    number: offer.number,
    status: offer.status,
    issueDate: offer.issueDate,
    validUntil: offer.validUntil,
    recipientName: offer.recipientName,
    recipientAddress: offer.recipientAddress,
    title: offer.title,
    intro: offer.intro,
    notes: offer.notes,
    issuer,
    items: offer.items.map((i) => ({
      title: i.title,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPriceCents: i.unitPriceCents,
      totalCents: i.totalCents,
    })),
    subtotalCents: offer.subtotalCents,
    vatRate: offer.vatRate,
    vatAmountCents: offer.vatAmountCents,
    totalCents: offer.totalCents,
    isSmallBusiness: offer.isSmallBusiness,
    logoBuffer: logo?.buffer ?? null,
    logoFormat: logo?.format ?? null,
    design: owner?.invoiceDesign ?? null,
  };
}
