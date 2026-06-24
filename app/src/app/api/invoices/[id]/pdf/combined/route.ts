import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderCombinedInvoicePdf } from "@/lib/invoice/pdf";
import { loadCancelPair } from "@/lib/invoice/load";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const owned = await prisma.invoice.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  });
  if (!owned) return new Response("Not found", { status: 404 });

  const pair = await loadCancelPair(id);
  if (!pair) return new Response("Keine Storno-Beziehung an dieser Rechnung", { status: 404 });

  // Defense-in-Depth: stelle sicher, dass auch der Storno-Partner dem User gehört.
  const partnerCheck = await prisma.invoice.count({
    where: { id: { in: [pair.originalId, pair.cancelId] }, ownerId: userId },
  });
  if (partnerCheck !== 2) return new Response("Not found", { status: 404 });

  const stream = await renderCombinedInvoicePdf(pair.original, pair.cancel);

  const reader = (stream as any) as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    reader.on("data", (c: Buffer) => chunks.push(c));
    reader.on("end", () => resolve());
    reader.on("error", reject);
  });
  const buf = Buffer.concat(chunks);

  const orig = pair.original.number ?? `Entwurf-${pair.originalId.slice(0, 6)}`;
  const cancel = pair.cancel.number ?? `Entwurf-${pair.cancelId.slice(0, 6)}`;
  const filename = `Beleg-${orig}+Storno-${cancel}.pdf`;

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
