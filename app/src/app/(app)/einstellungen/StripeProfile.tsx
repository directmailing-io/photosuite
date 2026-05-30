"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/form/Field";
import {
  Save, CreditCard, CheckCircle2, AlertCircle, Copy, RefreshCw,
  ShieldAlert, Link2, ExternalLink, Trash2, Eye, EyeOff, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { saveStripeKeys, saveStripeWebhookSecret, disconnectStripe } from "./stripeActions";

type Initial = {
  userId: string;
  webhookUrl: string;          // /api/webhooks/stripe/[userId]
  stripePublishableKey: string | null;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  stripeAccountId: string | null;
  stripeAccountName: string | null;
  stripeAccountCountry: string | null;
  stripeChargesEnabled: boolean;
  stripeLivemode: boolean;
  stripeKeysUpdatedAt: string | null;
};

const EVENTS_TO_SUBSCRIBE = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];

export function StripeProfile({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [showSecret, setShowSecret] = useState(false);
  const [showWhSec, setShowWhSec] = useState(false);
  const [editKeys, setEditKeys] = useState(!initial.hasSecretKey);
  const [editWhSec, setEditWhSec] = useState(!initial.hasWebhookSecret);
  const [pending, startTransition] = useTransition();

  const configured = Boolean(initial.hasSecretKey && initial.stripeAccountId);
  const fullyReady = Boolean(configured && initial.hasWebhookSecret && initial.stripeChargesEnabled);

  async function onSaveKeys(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveStripeKeys(fd);
      if (res.ok) {
        toast.success("Stripe-Verbindung erfolgreich getestet");
        setEditKeys(false);
        setShowSecret(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function onSaveWhSec(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveStripeWebhookSecret(fd);
      if (res.ok) {
        toast.success("Webhook-Secret gespeichert");
        setEditWhSec(false);
        setShowWhSec(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function onDisconnect() {
    if (!confirm("Stripe-Verbindung entfernen?\nAlle gespeicherten Keys werden gelöscht. Bereits ausgestellte Bezahllinks funktionieren nicht mehr.")) return;
    startTransition(async () => {
      await disconnectStripe();
      toast.success("Stripe-Verbindung entfernt");
      setEditKeys(true);
      setEditWhSec(true);
      router.refresh();
    });
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  }

  return (
    <div className="space-y-6">
      {/* Status-Banner */}
      <StatusBanner fullyReady={fullyReady} configured={configured} hasWebhookSecret={initial.hasWebhookSecret} chargesEnabled={initial.stripeChargesEnabled} />

      {/* Schritt 1: API-Keys */}
      <section className="card p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="eyebrow eyebrow-muted">Schritt 1</div>
            <h3 className="font-serif text-2xl mt-1">API-Keys deines Stripe-Kontos</h3>
            <p className="text-sm text-smoke mt-2 max-w-2xl leading-relaxed">
              Erstelle ein Stripe-Konto auf{" "}
              <a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener" className="text-ink underline hover:text-accent">
                dashboard.stripe.com/register
              </a>{" "}
              (kostenlos, EU-Anbieter via Stripe Payments Europe in Dublin). Aktiviere in deinem Stripe-Dashboard
              die Zahlungsmethoden Karte, SEPA-Lastschrift und PayPal — die App nutzt automatisch, was du dort frei&shy;gibst.
              Beide Keys findest du im Dashboard unter <em>Entwickler → API-Keys</em>.
            </p>
          </div>
          {configured && (
            <span className="badge shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
              <CheckCircle2 size={11} /> Verbunden
            </span>
          )}
        </div>

        {!editKeys && configured ? (
          <ConfiguredKeySummary initial={initial} onEdit={() => setEditKeys(true)} onDisconnect={onDisconnect} pending={pending} />
        ) : (
          <form onSubmit={onSaveKeys} className="space-y-4">
            <Field label="Publishable Key" hint="Beginnt mit pk_live_ oder pk_test_">
              <input
                name="stripePublishableKey"
                defaultValue={initial.stripePublishableKey ?? ""}
                placeholder="pk_live_..."
                className="input font-mono text-sm"
                required
              />
            </Field>
            <Field label="Secret Key" hint="Beginnt mit sk_live_, sk_test_ oder rk_… (Restricted Key). Wird verschlüsselt gespeichert.">
              <div className="relative">
                <input
                  name="stripeSecretKey"
                  type={showSecret ? "text" : "password"}
                  placeholder={initial.hasSecretKey ? "Neuen Key eingeben, um zu ersetzen" : "sk_live_..."}
                  className="input font-mono text-sm pr-10"
                  required
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-smoke hover:text-ink"
                  tabIndex={-1}
                  aria-label={showSecret ? "Verbergen" : "Anzeigen"}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button disabled={pending} className="btn-primary">
                <Save size={14} /> {pending ? "Prüfe…" : "Verbinden & testen"}
              </button>
              {initial.hasSecretKey && (
                <button type="button" onClick={() => setEditKeys(false)} className="btn-ghost" disabled={pending}>
                  Abbrechen
                </button>
              )}
              <div className="flex items-center gap-1.5 text-xs text-smoke ml-auto">
                <Lock size={11} /> AES-256-GCM verschlüsselt, an deinen Account gebunden
              </div>
            </div>
          </form>
        )}
      </section>

      {/* Schritt 2: Webhook */}
      <section className="card p-6" style={{ opacity: configured ? 1 : 0.55 }}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="eyebrow eyebrow-muted flex items-center gap-2">
              Schritt 2
              <span className="badge" style={{ background: "var(--linen)", color: "var(--smoke)", padding: "1px 8px" }}>
                optional zum Start
              </span>
            </div>
            <h3 className="font-serif text-2xl mt-1">Webhook einrichten</h3>
            <p className="text-sm text-smoke mt-2 max-w-2xl leading-relaxed">
              Für Karte & PayPal funktioniert alles auch ohne Webhook — wir verifizieren die Zahlung direkt, sobald die
              Kundin von Stripe zurückkommt. Den Webhook brauchst du nur für <strong>SEPA-Lastschrift</strong> (die wird
              asynchron bestätigt) und damit eine Zahlung auch dann markiert wird, wenn die Kundin den Browser-Tab schließt.
              Du kannst ihn jederzeit nachträglich ergänzen.
            </p>
          </div>
          {initial.hasWebhookSecret && (
            <span className="badge shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
              <CheckCircle2 size={11} /> Eingerichtet
            </span>
          )}
        </div>

        {/* Webhook URL */}
        <div className="rounded-xl border border-stone p-3 flex items-center gap-2 bg-linen/40 mb-3">
          <Link2 size={14} className="text-smoke shrink-0" />
          <code className="text-xs font-mono flex-1 truncate select-all">{initial.webhookUrl}</code>
          <button
            type="button"
            onClick={() => copyToClipboard(initial.webhookUrl, "Webhook-URL")}
            className="btn-icon"
            disabled={!configured}
            title="URL kopieren"
          >
            <Copy size={13} />
          </button>
        </div>

        {/* Events zum Abonnieren */}
        <div className="text-xs text-smoke mb-3">
          <div className="mb-1.5 font-medium text-ink">Diese Events abonnieren:</div>
          <ul className="space-y-1">
            {EVENTS_TO_SUBSCRIBE.map((e) => (
              <li key={e} className="flex items-center gap-2">
                <code className="font-mono select-all">{e}</code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(e, e)}
                  className="text-smoke hover:text-ink"
                  title="Event-Name kopieren"
                >
                  <Copy size={10} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Webhook Secret */}
        {!editWhSec && initial.hasWebhookSecret ? (
          <div className="flex items-center gap-2 text-sm pt-3 border-t border-stone/60">
            <CheckCircle2 size={14} className="text-accent" />
            <span>Webhook-Signing-Secret hinterlegt.</span>
            <button onClick={() => setEditWhSec(true)} className="btn-ghost text-xs ml-auto" disabled={pending}>
              <RefreshCw size={12} /> Ersetzen
            </button>
          </div>
        ) : (
          <form onSubmit={onSaveWhSec} className="space-y-3 pt-3 border-t border-stone/60">
            <Field label="Webhook-Signing-Secret" hint={`Stripe zeigt es direkt nach Erstellen des Endpoints unter „Signing secret". Beginnt mit whsec_`}>
              <div className="relative">
                <input
                  name="stripeWebhookSecret"
                  type={showWhSec ? "text" : "password"}
                  placeholder="whsec_..."
                  className="input font-mono text-sm pr-10"
                  required
                  disabled={!configured}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowWhSec((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-smoke hover:text-ink"
                  tabIndex={-1}
                >
                  {showWhSec ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={pending || !configured} className="btn-primary">
                <Save size={14} /> {pending ? "Speichern…" : "Secret speichern"}
              </button>
              {initial.hasWebhookSecret && (
                <button type="button" onClick={() => setEditWhSec(false)} className="btn-ghost" disabled={pending}>
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      {/* Hinweise */}
      <section className="card p-6 bg-linen/40">
        <div className="eyebrow eyebrow-muted mb-3">Hinweise</div>
        <ul className="space-y-2 text-sm text-ink/80">
          <li className="flex gap-2">
            <ShieldAlert size={14} className="text-smoke shrink-0 mt-0.5" />
            <span>
              <strong>SEPA-Lastschrift ist asynchron.</strong> Eine Zahlung wird erst nach Bestätigung durch die Bank
              endgültig als bezahlt markiert — das kann mehrere Tage dauern. Bei Rücklastschrift wird der Status
              automatisch zurückgesetzt.
            </span>
          </li>
          <li className="flex gap-2">
            <ExternalLink size={14} className="text-smoke shrink-0 mt-0.5" />
            <span>
              Verwende anfangs <strong>Test-Keys (pk_test_/sk_test_)</strong>, um den Ablauf zu prüfen. Stripe stellt
              dafür Test-Kartennummern bereit.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function StatusBanner({
  fullyReady, configured, hasWebhookSecret, chargesEnabled,
}: {
  fullyReady: boolean; configured: boolean; hasWebhookSecret: boolean; chargesEnabled: boolean;
}) {
  if (fullyReady) {
    return (
      <div className="card p-4 flex items-start gap-3" style={{ background: "var(--accent-soft)", borderLeftWidth: 3, borderLeftColor: "var(--accent)" }}>
        <CheckCircle2 size={18} className="text-accent shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Stripe ist einsatzbereit</div>
          <div className="text-smoke text-xs mt-0.5">
            Du kannst jetzt auf jeder ausgestellten Rechnung einen Bezahllink erstellen. Eingehende Zahlungen markieren die Rechnung automatisch als bezahlt.
          </div>
        </div>
      </div>
    );
  }
  if (!configured) {
    return (
      <div className="card p-4 flex items-start gap-3" style={{ background: "var(--linen)" }}>
        <CreditCard size={18} className="text-smoke shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium text-ink">Online-Zahlungen aktivieren</div>
          <div className="text-smoke text-xs mt-0.5">
            Verbinde dein Stripe-Konto, um deinen Kund:innen Bezahllinks für Karte, SEPA-Lastschrift und PayPal anbieten zu können.
            Stripe ist Phase-2-Erweiterung — bis dahin bleiben klassische Überweisung & Banktransfer aktiv.
          </div>
        </div>
      </div>
    );
  }
  if (!hasWebhookSecret && chargesEnabled) {
    return (
      <div className="card p-4 flex items-start gap-3" style={{ background: "var(--accent-soft)", borderLeftWidth: 3, borderLeftColor: "var(--accent)" }}>
        <CheckCircle2 size={18} className="text-accent shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Bezahllinks funktionieren bereits</div>
          <div className="text-smoke text-xs mt-0.5 leading-relaxed">
            Karten- und PayPal-Zahlungen werden direkt nach Rückkehr automatisch als bezahlt markiert.
            Der Webhook (Schritt 2) ist nur für <strong>SEPA-Lastschrift</strong> (verzögerte Bestätigung)
            und für den Fall, dass die Kundin den Tab schließt, bevor sie zurückkommt. Bequem zum Start, später ergänzen.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="card p-4 flex items-start gap-3" style={{ background: "var(--accent-soft)", borderLeftWidth: 3, borderLeftColor: "var(--accent)" }}>
      <AlertCircle size={18} className="text-accent shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-medium">Fast fertig</div>
        <div className="text-smoke text-xs mt-0.5">
          {!chargesEnabled && "Dein Stripe-Konto kann noch keine Zahlungen empfangen. Bitte in Stripe das Onboarding abschließen (Identifikation, Bankkonto)."}
        </div>
      </div>
    </div>
  );
}

function ConfiguredKeySummary({
  initial, onEdit, onDisconnect, pending,
}: {
  initial: Initial;
  onEdit: () => void;
  onDisconnect: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoCell label="Stripe-Account" value={initial.stripeAccountName ?? initial.stripeAccountId ?? "—"} mono={!initial.stripeAccountName} />
        <InfoCell label="Land" value={initial.stripeAccountCountry ?? "—"} />
        <InfoCell
          label="Modus"
          value={initial.stripeLivemode ? "Live" : "Test"}
          accent={initial.stripeLivemode}
        />
        <InfoCell
          label="Zahlungen aktiv"
          value={initial.stripeChargesEnabled ? "Ja" : "Noch nicht freigeschaltet"}
          accent={!initial.stripeChargesEnabled}
        />
        <InfoCell label="Publishable Key" value={initial.stripePublishableKey ?? "—"} mono />
        <InfoCell label="Secret Key" value="•••••• gespeichert" mono />
      </div>
      <div className="flex items-center gap-2 pt-2">
        <button type="button" onClick={onEdit} className="btn-secondary text-xs" disabled={pending}>
          <RefreshCw size={12} /> Keys ersetzen
        </button>
        <button type="button" onClick={onDisconnect} className="btn-ghost text-xs ml-auto" style={{ color: "var(--accent)" }} disabled={pending}>
          <Trash2 size={12} /> Verbindung trennen
        </button>
      </div>
    </div>
  );
}

function InfoCell({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-stone/60 p-3 bg-paper">
      <div className="text-[10px] uppercase tracking-wider text-smoke">{label}</div>
      <div
        className={`text-sm mt-1 truncate ${mono ? "font-mono" : ""}`}
        style={{ color: accent ? "var(--accent)" : undefined }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
