import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

// API-Version explizit pinnen — Breaking Changes von Stripe nur bei bewusstem Upgrade übernehmen.
const STRIPE_API_VERSION = "2026-05-27.dahlia" as const;

type StripeUser = {
  id: string;
  stripeSecretKeyEnc: string | null;
  stripeWebhookSecretEnc: string | null;
};

function buildClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    appInfo: {
      name: "Lisa CRM",
      version: "0.1.0",
    },
  });
}

export function stripeForUser(user: StripeUser): Stripe {
  if (!user.stripeSecretKeyEnc) {
    throw new Error("Stripe ist für diesen Account nicht konfiguriert.");
  }
  const secret = decryptSecret(user.stripeSecretKeyEnc, user.id);
  return buildClient(secret);
}

export async function stripeForUserId(userId: string): Promise<{ stripe: Stripe; webhookSecret: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, stripeSecretKeyEnc: true, stripeWebhookSecretEnc: true },
  });
  if (!user) throw new Error("User nicht gefunden");
  if (!user.stripeSecretKeyEnc || !user.stripeWebhookSecretEnc) {
    throw new Error("Stripe-Keys oder Webhook-Secret fehlen für diesen Account.");
  }
  const secret = decryptSecret(user.stripeSecretKeyEnc, user.id);
  const webhookSecret = decryptSecret(user.stripeWebhookSecretEnc, user.id);
  return { stripe: buildClient(secret), webhookSecret };
}

// Verifikations-Aufruf bei Key-Erstinstallation: prüft Key, holt Account-Daten zur Anzeige.
export async function verifyStripeKey(secretKey: string): Promise<{
  ok: true;
  accountId: string;
  accountName: string | null;
  chargesEnabled: boolean;
  country: string | null;
  livemode: boolean;
} | { ok: false; error: string }> {
  try {
    const stripe = buildClient(secretKey);
    const account = await stripe.accounts.retrieveCurrent();
    return {
      ok: true,
      accountId: account.id,
      accountName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null,
      chargesEnabled: account.charges_enabled ?? false,
      country: account.country ?? null,
      livemode: secretKey.startsWith("sk_live_"),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Stripe-Key ungültig" };
  }
}
