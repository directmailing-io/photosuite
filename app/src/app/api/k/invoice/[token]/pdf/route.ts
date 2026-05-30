import { prisma } from "@/lib/prisma";
import { renderInvoicePdf } from "@/lib/invoice/pdf";
import { loadInvoiceForPdf } from "@/lib/invoice/load";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const meta = await prisma.invoice.findUnique({
    where: { paymentToken: token },
    select: { id: true, number: true },
  });
  if (!meta) return new Response("Not found", { status: 404 });

  const data = await loadInvoiceForPdf(meta.id);
  if (!data) return new Response("Not found", { status: 404 });

  const stream = await renderInvoicePdf(data);
  const reader = stream as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    reader.on("data", (c: Buffer) => chunks.push(c));
    reader.on("end", () => resolve());
    reader.on("error", reject);
  });
  const buf = Buffer.concat(chunks);
  const filename = meta.number ? `Rechnung-${meta.number}.pdf` : "Rechnung.pdf";

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
