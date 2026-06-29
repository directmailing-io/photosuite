"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { loadCurrentUser } from "@/lib/loadUser";
import { revalidatePath } from "next/cache";
import { stripeForUser } from "@/lib/stripe";
import { generateUrlToken } from "@/lib/crypto";

async function getUserOrThrow() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
  const user = await loadCurrentUser(session);
  if (!user) throw new Error("User nicht gefunden");
  return user;
}

function buildAbsoluteUrl(path: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3006";
  return `${base.replace(/\/+$/, "")}${path}`;
}

// Stellt sicher, dass die Rechnung einen unguessable Payment-Token besitzt
// (für die Public-URL /k/r/[token]). Idempotent.
export async function ensurePaymentToken(invoiceId: string): Promise<string> {
  const user = await getUserOrThrow();
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, ownerId: user.id },
    select: { paymentToken: true },
  });
  if (!inv) throw new Error("Rechnung nicht gefunden");
  if (inv.paymentToken) return inv.paymentToken;
  const token = generateUrlToken();
  await prisma.invoice.update({ where: { id: invoiceId }, data: { paymentToken: token } });
  return token;
}

// Erstellt oder reaktiviert eine Stripe Checkout Session für die Rechnung.
// - Wiederverwendet bestehende offene Session, wenn noch nicht abgelaufen.
// - Markiert in der DB Session-ID, URL, Expiry.
export async function createOrReuseCheckoutSession(invoiceId: string): Promise<{
  url: string;
  sessionId: string;
  reused: boolean;
}> {
  const user = await getUserOrThrow();
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, ownerId: user.id } });
  if (!inv) throw new Error("Rechnung nicht gefunden");
  if (inv.status === "PAID") throw new Error("Rechnung ist bereits bezahlt.");
  if (inv.status === "CANCELLED") throw new Error("Stornierte Rechnungen können nicht online bezahlt werden.");
  if (inv.kind === "CANCEL") throw new Error("Stornorechnungen können nicht bezahlt werden.");
  if (inv.amountDueCents <= 0) throw new Error("Diese Rechnung hat keinen offenen Betrag.");
  if (!user.stripeSecretKeyEnc) throw new Error("Stripe ist nicht konfiguriert. Bitte in den Einstellungen verbinden.");

  const stripe = stripeForUser({
    id: user.id,
    stripeSecretKeyEnc: user.stripeSecretKeyEnc,
    stripeWebhookSecretEnc: user.stripeWebhookSecretEnc,
  });

  // Bestehende offene Session prüfen
  if (inv.stripeSessionId && inv.stripeSessionUrl && inv.stripeSessionExpiresAt && inv.stripeSessionExpiresAt > new Date()) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(inv.stripeSessionId);
      if (existing.status === "open") {
        return { url: existing.url ?? inv.stripeSessionUrl, sessionId: existing.id, reused: true };
      }
    } catch {
      // Falls Retrieve fehlschlägt (z.B. weil Live-/Test-Mode-Wechsel), neue Session erzeugen.
    }
  }

  // Payment-Token sicherstellen
  const token = inv.paymentToken ?? generateUrlToken();
  if (!inv.paymentToken) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { paymentToken: token } });
  }

  // Item-Beschreibung — Rechnungsnummer + Empfänger
  const productName = inv.number ? `Rechnung ${inv.number}` : "Rechnung";
  const customer = await prisma.customer.findUnique({ where: { id: inv.customerId } });

  // Session in EUR mit allen aktivierten Methoden
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      currency: "eur",
      // Methoden explizit setzen — User-Anforderung Phase 2.
      // 'sofort' ist seit 2025 abgekündigt → die ehemalige Sofortüberweisung läuft jetzt über Klarna „Pay Now".
      payment_method_types: ["card", "sepa_debit", "paypal", "klarna"],
      client_reference_id: inv.id,
      metadata: {
        invoiceId: inv.id,
        invoiceNumber: inv.number ?? "",
        userId: user.id,
        paymentToken: token,
      },
      payment_intent_data: {
        description: productName,
        metadata: {
          invoiceId: inv.id,
          invoiceNumber: inv.number ?? "",
          userId: user.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: inv.amountDueCents,
            product_data: {
              name: productName,
              description: customer ? `Empfänger:in ${customer.firstName} ${customer.lastName}` : undefined,
            },
          },
        },
      ],
      customer_email: customer?.email ?? undefined,
      success_url: buildAbsoluteUrl(`/k/r/${token}?paid=1`),
      cancel_url: buildAbsoluteUrl(`/k/r/${token}`),
      // expires_at NICHT setzen → Stripe-Default 24h.
      // Bei abgelaufener Session erzeugt der Public-Checkout-Endpoint automatisch eine neue —
      // der /k/r/[token]-Link bleibt also unbegrenzt nutzbar.
    },
    {
      idempotencyKey: `invoice-${inv.id}-${Date.now()}`,
    },
  );

  await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      stripeSessionId: session.id,
      stripeSessionUrl: session.url ?? null,
      stripeSessionExpiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
      stripePaymentStatus: "open",
    },
  });

  revalidatePath(`/buchhaltung/${inv.id}`);
  revalidatePath("/finanzen");
  return { url: session.url ?? "", sessionId: session.id, reused: false };
}

// Wenn Lisa die Session manuell stornieren möchte (z.B. weil sie eine neue
// Konfiguration ausprobiert), Session in Stripe expiren und DB-Felder leeren.
export async function revokeCheckoutSession(invoiceId: string): Promise<void> {
  const user = await getUserOrThrow();
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, ownerId: user.id } });
  if (!inv?.stripeSessionId) return;
  if (!user.stripeSecretKeyEnc) return;
  const stripe = stripeForUser({
    id: user.id,
    stripeSecretKeyEnc: user.stripeSecretKeyEnc,
    stripeWebhookSecretEnc: user.stripeWebhookSecretEnc,
  });
  try {
    await stripe.checkout.sessions.expire(inv.stripeSessionId);
  } catch {
    // already expired or paid — ignorieren
  }
  await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      stripeSessionId: null,
      stripeSessionUrl: null,
      stripeSessionExpiresAt: null,
      stripePaymentStatus: "expired",
    },
  });
  revalidatePath(`/buchhaltung/${invoiceId}`);
  revalidatePath("/finanzen");
}
