"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { loadCurrentUser } from "@/lib/loadUser";
import { revalidatePath } from "next/cache";
import { encryptSecret } from "@/lib/crypto";
import { verifyStripeKey } from "@/lib/stripe";

async function getUserOrThrow() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
  const user = await loadCurrentUser(session);
  if (!user) throw new Error("User nicht gefunden");
  return user;
}

function trimNonEmpty(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

// Erst-Konfiguration / Update der Stripe-Keys.
// Publishable + Secret werden gemeinsam validiert (eine Live-API-Probe).
// Webhook-Secret kann separat ergänzt werden, sobald der User den Endpoint in Stripe angelegt hat.
export async function saveStripeKeys(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserOrThrow();

  const publishable = trimNonEmpty(formData.get("stripePublishableKey"));
  const secret = trimNonEmpty(formData.get("stripeSecretKey"));

  if (!publishable || !secret) {
    return { ok: false, error: "Bitte sowohl Publishable Key (pk_…) als auch Secret Key (sk_…) angeben." };
  }
  if (!publishable.startsWith("pk_")) {
    return { ok: false, error: "Publishable Key muss mit 'pk_' beginnen." };
  }
  if (!secret.startsWith("sk_") && !secret.startsWith("rk_")) {
    return { ok: false, error: "Secret Key muss mit 'sk_' (oder 'rk_' für Restricted Key) beginnen." };
  }
  // Live/Test-Modus muss übereinstimmen, sonst kommt es bei Checkout zu Fehlern.
  const publishableLive = publishable.startsWith("pk_live_");
  const secretLive = secret.startsWith("sk_live_") || secret.startsWith("rk_live_");
  if (publishableLive !== secretLive) {
    return { ok: false, error: "Publishable und Secret Key müssen aus dem gleichen Modus stammen (beide live oder beide test)." };
  }

  // Live-Probe gegen Stripe.
  const verify = await verifyStripeKey(secret);
  if (!verify.ok) {
    return { ok: false, error: `Stripe lehnt den Key ab: ${verify.error}` };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripePublishableKey: publishable,
      stripeSecretKeyEnc: encryptSecret(secret, user.id),
      stripeAccountId: verify.accountId,
      stripeAccountName: verify.accountName,
      stripeAccountCountry: verify.country,
      stripeChargesEnabled: verify.chargesEnabled,
      stripeLivemode: verify.livemode,
      stripeKeysUpdatedAt: new Date(),
    },
  });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function saveStripeWebhookSecret(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserOrThrow();
  const whsec = trimNonEmpty(formData.get("stripeWebhookSecret"));
  if (!whsec) return { ok: false, error: "Bitte Webhook-Signing-Secret aus Stripe einfügen." };
  if (!whsec.startsWith("whsec_")) {
    return { ok: false, error: "Webhook-Secret muss mit 'whsec_' beginnen." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeWebhookSecretEnc: encryptSecret(whsec, user.id) },
  });
  revalidatePath("/einstellungen");
  return { ok: true };
}

export async function disconnectStripe(): Promise<void> {
  const user = await getUserOrThrow();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripePublishableKey: null,
      stripeSecretKeyEnc: null,
      stripeWebhookSecretEnc: null,
      stripeAccountId: null,
      stripeAccountName: null,
      stripeAccountCountry: null,
      stripeChargesEnabled: false,
      stripeLivemode: false,
      stripeKeysUpdatedAt: null,
    },
  });
  revalidatePath("/einstellungen");
}
