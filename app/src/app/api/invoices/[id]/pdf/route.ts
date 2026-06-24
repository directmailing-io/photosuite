import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderInvoicePdf } from "@/lib/invoice/pdf";
import { loadInvoiceForPdf } from "@/lib/invoice/load";

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

  const data = await loadInvoiceForPdf(id);
  if (!data) return new Response("Not found", { status: 404 });

  const stream = await renderInvoicePdf(data);

  const reader = (stream as any) as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    reader.on("data", (c: Buffer) => chunks.push(c));
    reader.on("end", () => resolve());
    reader.on("error", reject);
  });
  const buf = Buffer.concat(chunks);

  const filename = data.number
    ? `Rechnung-${data.number}.pdf`
    : `Rechnung-Entwurf-${id.slice(0, 6)}.pdf`;

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
