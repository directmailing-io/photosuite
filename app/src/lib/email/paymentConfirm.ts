import { prisma } from "@/lib/prisma";
import { sendEmailAsUser } from "@/lib/email/send";
import { eurFromCents } from "@/lib/money";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Karte",
  sepa_debit: "SEPA-Lastschrift",
  paypal: "PayPal",
  klarna: "Klarna",
  link: "Stripe Link",
  giropay: "giropay",
  sofort: "Sofortüberweisung",
};

type Source = "manual" | "stripe";

/**
 * Versendet die Zahlungsbestätigung an Kundin und/oder Lisa (User).
 *
 * Wird gerufen, wenn eine Rechnung NEU auf PAID gesetzt wird (manuell oder
 * via Stripe-Webhook). Idempotenz muss vom Caller sichergestellt sein —
 * dieser Helper sendet immer wenn er aufgerufen wird.
 *
 * Verhalten:
 * - Respektiert User-Toggles `payConfirmCustomer` und `payConfirmOwner`
 * - Silent skip wenn SMTP nicht konfiguriert (logged warning)
 * - Mail-Versand ist non-fatal: Fehler werden in Console geloggt, aber
 *   die aufrufende Transaction wird nicht zurückgerollt
 */
export async function sendPaymentConfirmation(
  invoiceId: string,
  source: Source,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: { select: { firstName: true, lastName: true, email: true } },
      owner: {
        select: {
          id: true,
          payConfirmCustomer: true,
          payConfirmOwner: true,
          smtpFromEmail: true,
          smtpHost: true,
          studioName: true,
          smtpFromName: true,
        },
      },
    },
  });
  if (!invoice) return;

  // Stornorechnungen lösen keine Zahlungsbestätigung aus.
  if (invoice.kind === "CANCEL") return;

  const owner = invoice.owner;
  if (!owner.smtpHost || !owner.smtpFromEmail) {
    console.warn(
      `[paymentConfirm] SMTP nicht konfiguriert für User ${owner.id} — Bestätigung übersprungen für Invoice ${invoiceId}`,
    );
    return;
  }

  const studioLabel = owner.smtpFromName ?? owner.studioName ?? "";
  const invoiceLabel = invoice.number ? `Rechnung ${invoice.number}` : `Rechnungsentwurf`;
  const amount = eurFromCents(invoice.totalCents);
  const methodKey = invoice.stripePaymentMethod ?? "";
  const methodLabel = PAYMENT_METHOD_LABELS[methodKey] ?? null;
  const paidDate = invoice.paidAt ?? new Date();
  const paidDateLabel = paidDate.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

  // --- Mail an die Kundin
  if (owner.payConfirmCustomer && invoice.customer.email) {
    const lines = [
      `Hi ${invoice.customer.firstName},`,
      "",
      `vielen Dank — wir haben deine Zahlung für ${invoiceLabel} erhalten.`,
      "",
      `Betrag: ${amount}`,
      `Eingegangen am: ${paidDateLabel}`,
      ...(methodLabel ? [`Zahlungsart: ${methodLabel}`] : []),
      "",
      "Bei Fragen melde dich gern jederzeit.",
      "",
      "Herzliche Grüße",
      studioLabel || "",
    ].filter((l) => l !== null);

    const result = await sendEmailAsUser(owner.id, {
      to: invoice.customer.email,
      subject: `Zahlung erhalten — ${invoiceLabel}`,
      text: lines.join("\n"),
    });
    if (!result.ok) {
      console.error(
        `[paymentConfirm] Kunden-Mail fehlgeschlagen für Invoice ${invoiceId}: ${result.reason}`,
      );
    }
  }

  // --- Mail an Lisa (User selbst)
  if (owner.payConfirmOwner) {
    const customerName = `${invoice.customer.firstName} ${invoice.customer.lastName}`.trim();
    const sourceLabel = source === "stripe" ? "Online-Zahlung via Stripe" : "Manuell als bezahlt markiert";
    const lines = [
      `${invoiceLabel} wurde bezahlt.`,
      "",
      `Kundin: ${customerName}`,
      `Betrag: ${amount}`,
      `Eingegangen am: ${paidDateLabel}`,
      `Quelle: ${sourceLabel}`,
      ...(methodLabel ? [`Zahlungsart: ${methodLabel}`] : []),
      "",
      `Rechnung im CRM: ${(process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? "")}/buchhaltung/${invoice.id}`,
    ];

    const result = await sendEmailAsUser(owner.id, {
      to: owner.smtpFromEmail,
      subject: `Zahlung eingegangen: ${invoiceLabel} (${amount})`,
      text: lines.join("\n"),
    });
    if (!result.ok) {
      console.error(
        `[paymentConfirm] Owner-Mail fehlgeschlagen für Invoice ${invoiceId}: ${result.reason}`,
      );
    }
  }
}
