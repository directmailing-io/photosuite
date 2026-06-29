import { prisma } from "@/lib/prisma";
import { parseIssuer } from "@/lib/invoiceSnapshot";
import type { InvoiceForPdf } from "./pdf";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Lädt das Logo vom Disk in einen Buffer für @react-pdf.
// Unterstützt PNG, JPG nativ. SVG wird via @resvg/resvg-js zu PNG gerendert (hochauflösend für scharfe PDFs).
export async function loadLogoBuffer(url: string | null, mime: string | null): Promise<{ buffer: Buffer; format: "png" | "jpg" } | null> {
  if (!url || !mime) return null;
  if (!url.startsWith("/uploads/")) return null;
  try {
    const path = join(process.cwd(), "public", url);
    const buffer = await readFile(path);
    if (mime === "image/png") return { buffer, format: "png" };
    if (mime === "image/jpeg") return { buffer, format: "jpg" };
    if (mime === "image/svg+xml") {
      // SVG → PNG via resvg, 600px hoch für scharfe Darstellung im PDF
      const { Resvg } = await import("@resvg/resvg-js");
      const resvg = new Resvg(buffer, {
        fitTo: { mode: "height", value: 600 },
        background: "rgba(255,255,255,0)",  // transparent
      });
      const pngData = resvg.render().asPng();
      return { buffer: Buffer.from(pngData), format: "png" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadInvoiceForPdf(id: string): Promise<InvoiceForPdf | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      cancelsInvoice: true,
    },
  });
  if (!invoice) return null;

  let prepaidInvoices: InvoiceForPdf["prepaidInvoices"] = undefined;
  if (invoice.kind === "FINAL") {
    const deps = await prisma.invoice.findMany({
      where: { parentInvoiceId: invoice.id, kind: "DEPOSIT" },
      orderBy: { issueDate: "asc" },
    });
    if (deps.length === 0 && invoice.shootingId) {
      const fallback = await prisma.invoice.findMany({
        where: { shootingId: invoice.shootingId, kind: "DEPOSIT", status: { not: "CANCELLED" } },
        orderBy: { issueDate: "asc" },
      });
      prepaidInvoices = fallback
        .filter((d) => d.number)
        .map((d) => ({
          number: d.number!,
          issueDate: d.issueDate,
          netCents: d.subtotalCents,
          vatCents: d.vatAmountCents,
          grossCents: d.totalCents,
        }));
    } else {
      prepaidInvoices = deps.map((d) => ({
        number: d.number!,
        issueDate: d.issueDate,
        netCents: d.subtotalCents,
        vatCents: d.vatAmountCents,
        grossCents: d.totalCents,
      }));
    }
  }

  const issuer = parseIssuer(invoice.issuerSnapshot);
  // Logo-Fallback: wenn der Snapshot kein Logo hat (z.B. Rechnung vor Logo-Upload erstellt),
  // greifen wir auf das aktuelle User-Logo zurück. Snapshot-Inhalte bleiben unangetastet.
  let logoUrl = issuer.logoUrl;
  let logoMime = issuer.logoMimeType;
  // Owner-Info wird einmal geladen — Design hängt am User, Logo-Fallback ebenfalls.
  const owner = await prisma.user.findUnique({
    where: { id: invoice.ownerId },
    select: { logoUrl: true, logoMimeType: true, invoiceDesign: true },
  });
  if (!logoUrl && owner?.logoUrl) {
    logoUrl = owner.logoUrl;
    logoMime = owner.logoMimeType;
  }
  const logo = await loadLogoBuffer(logoUrl, logoMime);

  return {
    number: invoice.number,
    kind: invoice.kind,
    status: invoice.status,
    issueDate: invoice.issueDate,
    serviceDate: invoice.serviceDate,
    serviceDateEnd: invoice.serviceDateEnd,
    dueDate: invoice.dueDate,
    recipientName: invoice.recipientName,
    recipientAddress: invoice.recipientAddress,
    issuer,
    logoBuffer: logo?.buffer ?? null,
    logoFormat: logo?.format ?? null,
    items: invoice.items.map((i) => ({
      title: i.title,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPriceCents: i.unitPriceCents,
      totalCents: i.totalCents,
    })),
    subtotalCents: invoice.subtotalCents,
    vatRate: invoice.vatRate,
    vatAmountCents: invoice.vatAmountCents,
    totalCents: invoice.totalCents,
    prepaidCents: invoice.prepaidCents,
    amountDueCents: invoice.amountDueCents,
    isSmallBusiness: invoice.isSmallBusiness,
    internalNote: invoice.internalNote,
    prepaidInvoices,
    cancelsInvoice: invoice.cancelsInvoice
      ? { number: invoice.cancelsInvoice.number ?? "—", issueDate: invoice.cancelsInvoice.issueDate }
      : null,
    design: owner?.invoiceDesign ?? null,
  };
}

// Löst für eine beliebige Rechnungs-ID das Beleg-Paar (Original + Storno) auf.
// Funktioniert sowohl, wenn die ID auf das Original zeigt (status=CANCELLED) als auch auf die Storno.
export async function loadCancelPair(id: string): Promise<{
  original: InvoiceForPdf;
  cancel: InvoiceForPdf;
  originalId: string;
  cancelId: string;
} | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      cancelsInvoiceId: true,
      cancelledByInvoice: { select: { id: true } },
    },
  });
  if (!inv) return null;

  let originalId: string;
  let cancelId: string;
  if (inv.kind === "CANCEL" && inv.cancelsInvoiceId) {
    originalId = inv.cancelsInvoiceId;
    cancelId = inv.id;
  } else if (inv.cancelledByInvoice) {
    originalId = inv.id;
    cancelId = inv.cancelledByInvoice.id;
  } else {
    return null;
  }

  const [original, cancel] = await Promise.all([
    loadInvoiceForPdf(originalId),
    loadInvoiceForPdf(cancelId),
  ]);
  if (!original || !cancel) return null;
  return { original, cancel, originalId, cancelId };
}
