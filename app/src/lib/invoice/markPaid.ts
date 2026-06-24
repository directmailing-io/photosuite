// Geteilte Mark-Paid-Logik, von Webhook-Handler UND der synchronen Return-Verifikation
// auf der Public-Pay-Page benutzt. Idempotent: Mehrfacher Aufruf ist sicher.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function paymentMethodTypeOf(s: Stripe.Checkout.Session): string | null {
  if (Array.isArray(s.payment_method_types) && s.payment_method_types.length === 1) {
    return s.payment_method_types[0];
  }
  return null;
}

export async function markInvoicePaidFromSession(
  invoiceId: string,
  session: Stripe.Checkout.Session,
  source: "webhook" | "return",
  eventId?: string,
): Promise<{ alreadyPaid: boolean }> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { alreadyPaid: false };
  if (inv.status === "PAID") {
    if (!inv.stripePaymentMethod) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { stripePaymentMethod: paymentMethodTypeOf(session) },
      });
    }
    return { alreadyPaid: true };
  }

  const intentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        stripePaymentStatus: "paid",
        stripePaymentIntentId: intentId,
        stripePaymentMethod: paymentMethodTypeOf(session),
      },
    });
    const installment = await tx.paymentInstallment.findFirst({ where: { invoiceId } });
    if (installment) {
      await tx.paymentInstallment.update({
        where: { id: installment.id },
        data: { paidAt: new Date() },
      });
    }
    await tx.activity.create({
      data: {
        kind: "payment_received",
        message: source === "webhook"
          ? `Online-Zahlung eingegangen (${paymentMethodTypeOf(session) ?? "Stripe"}) — Webhook ${eventId ?? ""}`.trim()
          : `Online-Zahlung bestätigt (${paymentMethodTypeOf(session) ?? "Stripe"}) — Stripe-Session-Verify`,
        customerId: inv.customerId,
        shootingId: inv.shootingId,
        ownerId: inv.ownerId,
      },
    });
    if (eventId) {
      await tx.stripeWebhookEvent.updateMany({
        where: { stripeEventId: eventId },
        data: { invoiceId },
      });
    }
  });

  revalidatePath(`/buchhaltung/${invoiceId}`);
  revalidatePath("/buchhaltung");
  if (inv.shootingId) revalidatePath(`/shootings/${inv.shootingId}`);
  if (inv.customerId) revalidatePath(`/kunden/${inv.customerId}`);

  return { alreadyPaid: false };
}

// Reflektiert den Stripe-Session-Status auf der Invoice (Übergang ISSUED → processing für SEPA),
// ohne den Status auf PAID zu setzen.
export async function reflectSessionStatus(
  invoiceId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      stripePaymentStatus: "processing",
      stripePaymentIntentId: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
      stripePaymentMethod: paymentMethodTypeOf(session),
    },
  });
  revalidatePath(`/buchhaltung/${invoiceId}`);
}
