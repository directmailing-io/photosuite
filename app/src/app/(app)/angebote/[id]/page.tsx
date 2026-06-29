import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { OfferDetail } from "./OfferDetail";
import { ChevronLeft } from "lucide-react";
import { parseIssuer } from "@/lib/invoiceSnapshot";

export const dynamic = "force-dynamic";

export default async function OfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({
    where: { id, ownerId: userId },
    include: {
      items: { orderBy: { position: "asc" } },
      customer: true,
      shooting: { select: { id: true, title: true } },
      convertedInvoice: { select: { id: true, number: true } },
    },
  });
  if (!offer) return notFound();

  return (
    <>
      <div className="mb-2">
        <Link href="/angebote" className="text-xs text-smoke hover:text-ink flex items-center gap-1">
          <ChevronLeft size={12} /> Zurück zur Übersicht
        </Link>
      </div>

      <PageHeader
        eyebrow="Angebot"
        title={offer.number ?? "Entwurf"}
        subtitle={`${offer.customer.firstName} ${offer.customer.lastName}${offer.shooting ? ` · ${offer.shooting.title}` : ""}`}
      />

      <OfferDetail
        offer={{
          id: offer.id,
          number: offer.number,
          status: offer.status,
          recipientName: offer.recipientName,
          recipientAddress: offer.recipientAddress,
          issuer: parseIssuer(offer.issuerSnapshot),
          title: offer.title,
          intro: offer.intro,
          notes: offer.notes,
          internalNote: offer.internalNote,
          issueDate: offer.issueDate.toISOString(),
          validUntil: offer.validUntil?.toISOString() ?? null,
          isSmallBusiness: offer.isSmallBusiness,
          vatRate: offer.vatRate,
          subtotalCents: offer.subtotalCents,
          vatAmountCents: offer.vatAmountCents,
          totalCents: offer.totalCents,
          sentAt: offer.sentAt?.toISOString() ?? null,
          acceptedAt: offer.acceptedAt?.toISOString() ?? null,
          declinedAt: offer.declinedAt?.toISOString() ?? null,
          declineReason: offer.declineReason,
          publicToken: offer.publicToken,
          convertedInvoice: offer.convertedInvoice,
          items: offer.items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPriceCents: i.unitPriceCents,
            totalCents: i.totalCents,
          })),
        }}
      />
    </>
  );
}
