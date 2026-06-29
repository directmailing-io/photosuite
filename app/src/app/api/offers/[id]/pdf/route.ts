import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { renderOfferPdf } from "@/lib/offer/pdf";
import { loadOfferForPdf } from "@/lib/offer/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authentifizierte Angebots-PDF für Lisa.
 * IDOR-Check via ownerId-Match. Auch bei DRAFT-Angeboten verfügbar (Vorschau).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const offer = await prisma.offer.findFirst({
    where: { id, ownerId: userId },
    select: { id: true, number: true },
  });
  if (!offer) return new NextResponse("Nicht gefunden", { status: 404 });

  const data = await loadOfferForPdf(offer.id);
  if (!data) return new NextResponse("Konnte nicht geladen werden", { status: 500 });

  const stream = await renderOfferPdf(data);
  const filename = offer.number ? `Angebot-${offer.number}.pdf` : `Angebot-Entwurf.pdf`;
  return new NextResponse(stream as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
