// Public API: startet/reaktiviert die Stripe-Checkout-Session für eine per Token aufgerufene Rechnung.
// KEIN Auth — Authentifizierung erfolgt durch Wissen um den 256-bit-Token.
// Verifiziert vor jeder Session-Erstellung den Status (nicht bezahlt, nicht storniert, offener Betrag).

import { prisma } from "@/lib/prisma";
import { stripeForUser } from "@/lib/stripe";

export const dynamic = "force-dynamic";

function buildAbsoluteUrl(path: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3006";
  return `${base.replace(/\/+$/, "")}${path}`;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { paymentToken: token },
    include: { customer: true },
  });
  if (!invoice) {
    return Response.json({ error: "Rechnung nicht gefunden" }, { status: 404 });
  }

  if (invoice.status === "PAID") {
    return Response.json({ error: "Diese Rechnung ist bereits bezahlt." }, { status: 409 });
  }
  if (invoice.status === "CANCELLED" || invoice.kind === "CANCEL") {
    return Response.json({ error: "Diese Rechnung wurde storniert und kann nicht bezahlt werden." }, { status: 409 });
  }
  if (invoice.amountDueCents <= 0) {
    return Response.json({ error: "Kein offener Betrag." }, { status: 409 });
  }

  // Aussteller = Owner DIESER Invoice (Multi-Tenant) — NICHT findFirst, sonst
  // landet die Zahlung im falschen Stripe-Account.
  const studio = await prisma.user.findUnique({
    where: { id: invoice.ownerId },
    select: { id: true, stripeSecretKeyEnc: true, stripeWebhookSecretEnc: true, stripeChargesEnabled: true },
  });
  if (!studio || !studio.stripeSecretKeyEnc || !studio.stripeChargesEnabled) {
    return Response.json({ error: "Online-Zahlung ist gerade nicht verfügbar." }, { status: 503 });
  }

  const stripe = stripeForUser({
    id: studio.id,
    stripeSecretKeyEnc: studio.stripeSecretKeyEnc,
    stripeWebhookSecretEnc: studio.stripeWebhookSecretEnc,
  });

  // Bestehende offene Session wiederverwenden
  if (invoice.stripeSessionId && invoice.stripeSessionUrl && invoice.stripeSessionExpiresAt && invoice.stripeSessionExpiresAt > new Date()) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(invoice.stripeSessionId);
      if (existing.status === "open" && existing.url) {
        return Response.json({ url: existing.url, reused: true });
      }
    } catch {
      // fällt auf Neu-Erstellung zurück
    }
  }

  const productName = invoice.number ? `Rechnung ${invoice.number}` : "Rechnung";
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      currency: "eur",
      // Methoden explizit (Karte, SEPA, PayPal, Klarna). 'sofort' ist 2025 abgekündigt —
      // Sofortüberweisung läuft in DE inzwischen über Klarna „Pay Now".
      payment_method_types: ["card", "sepa_debit", "paypal", "klarna"],
      client_reference_id: invoice.id,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number ?? "",
        userId: studio.id,
        paymentToken: token,
      },
      payment_intent_data: {
        description: productName,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number ?? "",
          userId: studio.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: invoice.amountDueCents,
            product_data: {
              name: productName,
              description: `Empfänger:in ${invoice.customer.firstName} ${invoice.customer.lastName}`,
            },
          },
        },
      ],
      customer_email: invoice.customer.email ?? undefined,
      success_url: buildAbsoluteUrl(`/k/r/${token}?paid=1`),
      cancel_url: buildAbsoluteUrl(`/k/r/${token}`),
      // expires_at NICHT setzen → Stripe-Default 24h (Max-Wert). Beim nächsten Aufruf wird,
      // falls expired, automatisch eine neue Session erzeugt — Public-Link bleibt unbegrenzt nutzbar.
    },
    {
      idempotencyKey: `pub-invoice-${invoice.id}-${Date.now()}`,
    },
  );

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      stripeSessionId: session.id,
      stripeSessionUrl: session.url ?? null,
      stripeSessionExpiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
      stripePaymentStatus: "open",
    },
  });

  return Response.json({ url: session.url, reused: false });
}
