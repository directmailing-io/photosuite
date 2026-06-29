import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { InvoiceDetail } from "./InvoiceDetail";
import { ChevronLeft } from "lucide-react";
import { parseIssuer } from "@/lib/invoiceSnapshot";
import { generateUrlToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const [inv, user, catalog] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, ownerId: userId },
      include: {
        items: { orderBy: { position: "asc" } },
        customer: true,
        shooting: { include: { package: true } },
        cancelsInvoice: true,
        cancelledByInvoice: true,
        reminders: { orderBy: { level: "asc" } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.articleCatalog.findMany({
      where: { ownerId: userId, isActive: true },
      orderBy: [{ kind: "asc" }, { position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, kind: true, unit: true, defaultPriceCents: true },
    }),
  ]);
  if (!inv) return notFound();

  // Lazy-Backfill: ältere ausgestellte Rechnungen ohne Token bekommen einen,
  // damit der Bezahllink immer verfügbar ist — aber nur, wenn der Link auch
  // gewünscht ist (paymentLinkEnabled).
  if (
    inv.status === "ISSUED" &&
    inv.kind !== "CANCEL" &&
    inv.paymentLinkEnabled &&
    !inv.paymentToken
  ) {
    const token = generateUrlToken();
    await prisma.invoice.update({ where: { id: inv.id }, data: { paymentToken: token } });
    inv.paymentToken = token;
  }

  const KIND_LABEL: Record<string, string> = {
    DEPOSIT: "Anzahlungsrechnung",
    INTERIM: "Teilrechnung",
    FINAL: "Rechnung",
    CANCEL: "Stornorechnung",
  };

  return (
    <>
      <div className="mb-2">
        <Link href="/buchhaltung" className="text-xs text-smoke hover:text-ink flex items-center gap-1">
          <ChevronLeft size={12} /> Zurück zur Übersicht
        </Link>
      </div>

      <PageHeader
        eyebrow={KIND_LABEL[inv.kind] ?? "Rechnung"}
        title={inv.number ?? "Entwurf"}
        subtitle={`${inv.customer.firstName} ${inv.customer.lastName}${inv.shooting ? ` · ${inv.shooting.title}` : ""}`}
      />

      <InvoiceDetail
        invoice={{
          id: inv.id,
          number: inv.number,
          kind: inv.kind,
          status: inv.status,
          recipientName: inv.recipientName,
          recipientAddress: inv.recipientAddress,
          issuer: parseIssuer(inv.issuerSnapshot),
          issueDate: inv.issueDate.toISOString(),
          serviceDate: inv.serviceDate?.toISOString() ?? null,
          serviceDateEnd: inv.serviceDateEnd?.toISOString() ?? null,
          dueDate: inv.dueDate.toISOString(),
          subtotalCents: inv.subtotalCents,
          vatRate: inv.vatRate,
          vatAmountCents: inv.vatAmountCents,
          totalCents: inv.totalCents,
          prepaidCents: inv.prepaidCents,
          amountDueCents: inv.amountDueCents,
          isSmallBusiness: inv.isSmallBusiness,
          internalNote: inv.internalNote,
          paidAt: inv.paidAt?.toISOString() ?? null,
          sentAt: inv.sentAt?.toISOString() ?? null,
          reminderLevel: inv.reminderLevel,
          reminders: inv.reminders.map((r) => ({
            id: r.id,
            level: r.level,
            feeCents: r.feeCents,
            newDueDate: r.newDueDate.toISOString(),
            issuedAt: r.issuedAt.toISOString(),
          })),
          items: inv.items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPriceCents: i.unitPriceCents,
            totalCents: i.totalCents,
          })),
          cancelsInvoice: inv.cancelsInvoice ? {
            id: inv.cancelsInvoice.id,
            number: inv.cancelsInvoice.number,
          } : null,
          cancelledByInvoice: inv.cancelledByInvoice ? {
            id: inv.cancelledByInvoice.id,
            number: inv.cancelledByInvoice.number,
          } : null,
          paymentLinkEnabled: inv.paymentLinkEnabled,
          paymentToken: inv.paymentToken,
          stripeSessionUrl: inv.stripeSessionUrl,
          stripeSessionExpiresAt: inv.stripeSessionExpiresAt?.toISOString() ?? null,
          stripePaymentStatus: inv.stripePaymentStatus,
          stripePaymentMethod: inv.stripePaymentMethod,
        }}
        reminderConfig={{
          days1: user?.reminderDays1 ?? 7,
          days2: user?.reminderDays2 ?? 7,
          days3: user?.reminderDays3 ?? 14,
          fee1Cents: user?.reminderFee1Cents ?? 0,
          fee2Cents: user?.reminderFee2Cents ?? 500,
          fee3Cents: user?.reminderFee3Cents ?? 1000,
        }}
        stripeReady={!!user?.stripeSecretKeyEnc && !!user?.stripeChargesEnabled}
        catalog={catalog}
      />
    </>
  );
}
