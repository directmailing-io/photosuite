// Stripe-Webhook pro User-Account.
// Verifiziert die Signatur mit dem user-spezifischen Webhook-Secret, dedupliziert
// per event.id und mappt Stripe-Events auf Invoice-Statusänderungen.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForUserId } from "@/lib/stripe";
import { markInvoicePaidFromSession, reflectSessionStatus } from "@/lib/invoice/markPaid";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  // App Router: rohen Body als Text lesen — niemals req.json(), sonst bricht die Signaturprüfung.
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // Stripe-Client + Webhook-Secret aus den verschlüsselten User-Settings holen.
  let stripe: Stripe;
  let webhookSecret: string;
  try {
    const ctx = await stripeForUserId(userId);
    stripe = ctx.stripe;
    webhookSecret = ctx.webhookSecret;
  } catch (err: any) {
    return new Response(`Webhook nicht konfiguriert: ${err?.message ?? "unbekannt"}`, { status: 400 });
  }

  // Signatur verifizieren — wirft, wenn Signatur ungültig oder Timestamp zu alt (Replay).
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    return new Response(`Signatur ungültig: ${err?.message ?? "unbekannt"}`, { status: 400 });
  }

  // Defense-in-Depth: prüfe metadata.userId aus dem Stripe-Object gegen die URL-userId.
  // Schützt vor Stripe-Secret-Reuse / Mis-Routing (z.B. wenn Lisa versehentlich denselben
  // Webhook-Secret in zwei Accounts hinterlegt). Wenn metadata.userId fehlt: legacy
  // event — warnen, aber durchlassen.
  const objWithMeta = event.data.object as { metadata?: Record<string, string> | null } | null;
  const eventUserId = objWithMeta?.metadata?.userId;
  if (eventUserId) {
    if (eventUserId !== userId) {
      return new Response(
        `Event-Owner-Mismatch: metadata.userId (${eventUserId}) != URL userId (${userId})`,
        { status: 400 },
      );
    }
  } else {
    // legacy: ohne metadata.userId können wir nur via Signatur verifizieren — ist OK,
    // aber loggen damit wir wissen woher es kommt.
    console.warn(
      `[stripe-webhook] event ${event.id} (type=${event.type}) has no metadata.userId — falling back to signature-only validation`,
    );
  }

  // Idempotenz: event.id wurde schon verarbeitet?
  const already = await prisma.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (already?.processed) {
    return Response.json({ received: true, deduped: true });
  }

  // Persist event upfront — auch bei späterem Fehler haben wir Audit.
  if (!already) {
    await prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        userId,
        type: event.type,
      },
    });
  }

  try {
    await handleEvent(event, userId);
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { processed: true, errorMessage: null },
    });
    return Response.json({ received: true });
  } catch (err: any) {
    await prisma.stripeWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { errorMessage: err?.message ?? String(err) },
    });
    // 500 → Stripe wiederholt mit Exponential Backoff
    return new Response(`Verarbeitungsfehler: ${err?.message ?? "unbekannt"}`, { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event, userId: string): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session, userId, event.id);
      break;
    case "checkout.session.async_payment_succeeded":
      await onAsyncSucceeded(event.data.object as Stripe.Checkout.Session, userId, event.id);
      break;
    case "checkout.session.async_payment_failed":
      await onAsyncFailed(event.data.object as Stripe.Checkout.Session, userId, event.id);
      break;
    case "checkout.session.expired":
      await onSessionExpired(event.data.object as Stripe.Checkout.Session, userId, event.id);
      break;
    default:
      // unbekanntes Event → einfach ack'en
      break;
  }
}

function findInvoiceIdFromSession(s: Stripe.Checkout.Session): string | null {
  return s.metadata?.invoiceId ?? s.client_reference_id ?? null;
}

// Defense-in-Depth: löst Invoice-ID aus Session UND validiert, dass die Invoice
// dem URL-userId gehört. Verhindert, dass ein fehlgeleitetes Event eine fremde
// Invoice manipuliert — selbst wenn metadata.userId fehlt oder gefälscht wäre.
async function resolveOwnedInvoiceId(s: Stripe.Checkout.Session, urlUserId: string): Promise<string | null> {
  const invoiceId = findInvoiceIdFromSession(s);
  if (!invoiceId) return null;
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, ownerId: urlUserId },
    select: { id: true },
  });
  if (!inv) {
    console.warn(
      `[stripe-webhook] invoice ${invoiceId} not found for user ${urlUserId} — ignoring event`,
    );
    return null;
  }
  return inv.id;
}

async function onCheckoutCompleted(s: Stripe.Checkout.Session, userId: string, eventId: string) {
  const invoiceId = await resolveOwnedInvoiceId(s, userId);
  if (!invoiceId) return;
  if (s.payment_status === "paid") {
    await markInvoicePaidFromSession(invoiceId, s, "webhook", eventId);
  } else if (s.payment_status === "unpaid") {
    await reflectSessionStatus(invoiceId, s);
  }
}

async function onAsyncSucceeded(s: Stripe.Checkout.Session, userId: string, eventId: string) {
  const invoiceId = await resolveOwnedInvoiceId(s, userId);
  if (!invoiceId) return;
  await markInvoicePaidFromSession(invoiceId, s, "webhook", eventId);
}

async function onAsyncFailed(s: Stripe.Checkout.Session, userId: string, _eventId: string) {
  const invoiceId = await resolveOwnedInvoiceId(s, userId);
  if (!invoiceId) return;
  // updateMany mit ownerId-Filter ist hier defensiv redundant (resolveOwnedInvoiceId
  // hat bereits validiert), kostet aber nichts und schützt vor Race-Conditions.
  await prisma.invoice.updateMany({
    where: { id: invoiceId, ownerId: userId },
    data: { stripePaymentStatus: "failed" },
  });
  revalidatePath(`/buchhaltung/${invoiceId}`);
  revalidatePath("/buchhaltung");
}

async function onSessionExpired(s: Stripe.Checkout.Session, userId: string, _eventId: string) {
  const invoiceId = await resolveOwnedInvoiceId(s, userId);
  if (!invoiceId) return;
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, ownerId: userId },
    select: { stripePaymentStatus: true, stripeSessionId: true },
  });
  if (inv?.stripeSessionId === s.id && inv.stripePaymentStatus === "open") {
    await prisma.invoice.updateMany({
      where: { id: invoiceId, ownerId: userId },
      data: {
        stripeSessionId: null,
        stripeSessionUrl: null,
        stripeSessionExpiresAt: null,
        stripePaymentStatus: "expired",
      },
    });
    revalidatePath(`/buchhaltung/${invoiceId}`);
    revalidatePath("/buchhaltung");
  }
}
