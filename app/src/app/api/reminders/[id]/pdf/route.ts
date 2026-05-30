import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseIssuer } from "@/lib/invoiceSnapshot";
import { renderReminderPdf } from "@/lib/invoice/reminderPdf";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const reminder = await prisma.invoiceReminder.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!reminder) return new Response("Not found", { status: 404 });

  const inv = reminder.invoice;
  if (!inv.number) return new Response("Invoice not issued", { status: 400 });

  const stream = await renderReminderPdf({
    level: reminder.level,
    feeCents: reminder.feeCents,
    newDueDate: reminder.newDueDate,
    issuedAt: reminder.issuedAt,
    invoice: {
      number: inv.number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalCents: inv.totalCents,
      amountDueCents: inv.amountDueCents,
      recipientName: inv.recipientName,
      recipientAddress: inv.recipientAddress,
      issuer: parseIssuer(inv.issuerSnapshot),
    },
  });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    (stream as any).on("data", (c: Buffer) => chunks.push(c));
    (stream as any).on("end", () => resolve());
    (stream as any).on("error", reject);
  });
  const buf = Buffer.concat(chunks);

  const filename = `Mahnung-Stufe${reminder.level}-zu-${inv.number}.pdf`;
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
