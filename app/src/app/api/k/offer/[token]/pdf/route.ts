import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderOfferPdf } from "@/lib/offer/pdf";
import { loadOfferForPdf } from "@/lib/offer/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public-Variante der Angebots-PDF — Kundin kann ihr Angebot direkt von der
 * /k/o/[token]-Seite herunterladen. Zugang via unguessable Token.
 *
 * Nur für SENT/ACCEPTED/DECLINED-Status verfügbar (kein DRAFT, kein WITHDRAWN).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await prisma.offer.findFirst({
    where: { publicToken: token },
    select: { id: true, number: true, status: true },
  });
  if (!offer) return new NextResponse("Nicht gefunden", { status: 404 });
  if (offer.status === "DRAFT" || offer.status === "WITHDRAWN") {
    return new NextResponse("Angebot nicht verfügbar", { status: 404 });
  }

  const data = await loadOfferForPdf(offer.id);
  if (!data) return new NextResponse("Konnte nicht geladen werden", { status: 500 });

  const stream = await renderOfferPdf(data);
  const filename = offer.number ? `Angebot-${offer.number}.pdf` : `Angebot.pdf`;
  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
