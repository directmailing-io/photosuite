"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { sendEmailAsUser } from "@/lib/email/send";
import { revalidatePath } from "next/cache";
import { renderInvoicePdf } from "@/lib/invoice/pdf";
import { loadInvoiceForPdf } from "@/lib/invoice/load";

/**
 * Versendet die Rechnung als E-Mail mit PDF-Attachment.
 * Nutzt das User-SMTP-Setup (siehe lib/email/send.ts).
 *
 * Sicherheit:
 *   - IDOR-Check via requireUserId + findFirst
 *   - PDF wird server-side generiert (renderInvoicePdf) — kein User-URL nötig
 *   - Empfänger ist Recipient (snapshot) ODER Kunde (fallback)
 *   - Bei Versand: invoice.status → ISSUED + sentAt timestamp gesetzt
 */
export async function sendInvoiceByEmail(invoiceId: string, customMessage?: string): Promise<void> {
  const userId = await requireUserId();
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, ownerId: userId },
    include: { customer: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!invoice) throw new Error("Rechnung nicht gefunden");
  if (invoice.kind === "CANCEL") throw new Error("Stornorechnungen werden nicht per Mail verschickt.");

  const recipient = invoice.customer.email;
  if (!recipient) throw new Error("Die Kundin hat keine E-Mail-Adresse hinterlegt — bitte zuerst pflegen.");

  // PDF rendern
  const data = await loadInvoiceForPdf(invoiceId);
  if (!data) throw new Error("Rechnung konnte nicht geladen werden.");
  const stream = await renderInvoicePdf(data);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    (stream as any).on("data", (c: Buffer) => chunks.push(c));
    (stream as any).on("end", () => resolve());
    (stream as any).on("error", reject);
  });
  const pdfBuffer = Buffer.concat(chunks);

  const subject = invoice.number
    ? `Rechnung ${invoice.number}`
    : `Deine Rechnung`;
  const text = customMessage ?? defaultMessage(invoice.customer.firstName, invoice.number);

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { studioName: true, smtpFromName: true },
  });
  const studioName = owner?.smtpFromName ?? owner?.studioName ?? "";

  // Versand via nodemailer (auto-Multipart, da text + Anhang).
  // Wir delegieren an sendEmailAsUser und hängen Attachment via tieferer nodemailer-API an —
  // simple Variante: direkt eigenen Transporter, weil sendEmailAsUser kein attachments-Feld kennt.
  const { default: nodemailer } = await import("nodemailer");
  const { decryptSecret } = await import("@/lib/crypto");
  const smtpUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { smtpHost: true, smtpPort: true, smtpSecure: true, smtpUser: true, smtpPasswordEnc: true, smtpFromEmail: true, smtpFromName: true },
  });
  if (!smtpUser?.smtpHost || !smtpUser.smtpPort || !smtpUser.smtpUser || !smtpUser.smtpPasswordEnc || !smtpUser.smtpFromEmail) {
    throw new Error("Bitte zuerst SMTP unter Einstellungen → E-Mail konfigurieren.");
  }
  const pw = decryptSecret(smtpUser.smtpPasswordEnc, userId);
  const transporter = nodemailer.createTransport({
    host: smtpUser.smtpHost,
    port: smtpUser.smtpPort,
    secure: smtpUser.smtpSecure,
    auth: { user: smtpUser.smtpUser, pass: pw },
  });
  const fromName = smtpUser.smtpFromName ? `"${smtpUser.smtpFromName.replace(/"/g, "")}" ` : "";
  const pdfName = invoice.number ? `Rechnung-${invoice.number}.pdf` : `Rechnungsentwurf.pdf`;

  await transporter.sendMail({
    from: `${fromName}<${smtpUser.smtpFromEmail}>`,
    to: recipient,
    subject,
    text,
    attachments: [
      { filename: pdfName, content: pdfBuffer, contentType: "application/pdf" },
    ],
  });

  // Status auf ISSUED + sentAt setzen (wenn DRAFT vorher)
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: invoice.status === "DRAFT" ? "ISSUED" : invoice.status,
      sentAt: new Date(),
    },
  });

  revalidatePath(`/buchhaltung/${invoiceId}`);
  revalidatePath("/buchhaltung");
}

function defaultMessage(firstName: string, invoiceNumber: string | null): string {
  return [
    `Hi ${firstName},`,
    "",
    invoiceNumber
      ? `anbei findest du die Rechnung ${invoiceNumber} als PDF.`
      : `anbei findest du die Rechnung als PDF.`,
    "",
    "Bei Fragen melde dich gern jederzeit.",
    "",
    "Herzliche Grüße",
  ].join("\n");
}
