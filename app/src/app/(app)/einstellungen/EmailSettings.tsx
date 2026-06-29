"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Save, TestTube, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import { saveSmtpConfig, testSmtpFromConfig, sendTestEmail } from "./emailActions";

export type EmailSettingsInitial = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasSmtpPassword: boolean;       // wir senden das Klartext-Passwort NICHT zurück
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  emailNotifyDefault: boolean;
  payConfirmCustomer: boolean;
  payConfirmOwner: boolean;
};

/**
 * SMTP-Setup für den Email-Versand an Kundinnen.
 *
 * Provider-Empfehlung (EU/CLOUD-Act-frei): Mailbox.org, IONOS, Posteo, Hostinger.
 * Lisa konfiguriert ihre eigenen Zugangsdaten — wir senden nie über ein
 * Lisa-fremdes Konto.
 */
export function EmailSettings({ initial }: { initial: EmailSettingsInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await saveSmtpConfig(fd);
        toast.success("Email-Setup gespeichert");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht speichern");
      }
    });
  }

  async function onTestConnection(form: HTMLFormElement) {
    setTesting(true);
    setTestResult(null);
    try {
      const fd = new FormData(form);
      const res = await testSmtpFromConfig(fd);
      setTestResult(res);
      if (res.ok) toast.success("SMTP-Verbindung OK");
      else toast.error("Verbindung fehlgeschlagen", { description: res.reason });
    } finally {
      setTesting(false);
    }
  }

  async function onTestSend() {
    setTesting(true);
    try {
      const res = await sendTestEmail();
      if (res.ok) {
        toast.success("Test-Mail gesendet", {
          description: `An ${initial.smtpFromEmail} — bitte Posteingang prüfen.`,
        });
      } else {
        toast.error("Test-Mail fehlgeschlagen", { description: res.reason });
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Mail size={20} className="shrink-0 mt-1 text-accent" />
          <div>
            <div className="font-serif text-xl">Email-Versand</div>
            <p className="text-xs text-smoke mt-1 max-w-2xl leading-relaxed">
              Verbinde deinen eigenen SMTP-Account, damit du Kundinnen aus dem CRM heraus
              benachrichtigen kannst — z.B. bei neuen Terminen oder Updates am Dashboard.
              <br />
              <strong>EU-konform empfohlen:</strong> Mailbox.org, IONOS, Posteo, Hostinger.
              Daten bleiben in deiner Hand, kein US-Anbieter dazwischen.
            </p>
          </div>
        </div>

        <FormRow>
          <Field label="SMTP-Host *" hint="z.B. smtp.mailbox.org">
            <input
              name="smtpHost"
              defaultValue={initial.smtpHost ?? ""}
              required
              placeholder="smtp.deinanbieter.de"
              className="input"
            />
          </Field>
          <Field label="Port *" hint="465 (SSL) oder 587 (STARTTLS)">
            <input
              name="smtpPort"
              type="number"
              defaultValue={initial.smtpPort ?? 465}
              required
              placeholder="465"
              className="input"
            />
          </Field>
        </FormRow>

        <FormRow>
          <Field label="Benutzer *" hint="meist deine Email-Adresse">
            <input
              name="smtpUser"
              defaultValue={initial.smtpUser ?? ""}
              required
              placeholder="lisa@deinanbieter.de"
              className="input"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Passwort"
            hint={
              initial.hasSmtpPassword
                ? "Bestehendes Passwort bleibt aktiv — nur ausfüllen zum Ändern."
                : "App-spezifisches Passwort empfohlen (nicht dein normales Login)."
            }
          >
            <div className="relative">
              <input
                name="smtpPassword"
                type={showPassword ? "text" : "password"}
                placeholder={initial.hasSmtpPassword ? "••••••••" : "App-Passwort"}
                className="input pr-9"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-smoke hover:text-ink"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
        </FormRow>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="smtpSecure"
            defaultChecked={initial.smtpSecure}
            className="w-4 h-4"
          />
          <span>SSL/TLS (Port 465). Bei STARTTLS (Port 587) deaktivieren.</span>
        </label>

        <div className="hairline pt-4 space-y-3">
          <FormRow>
            <Field label="Absender-Email *" hint={'Diese Adresse erscheint im „Von:"-Feld'}>
              <input
                name="smtpFromEmail"
                type="email"
                defaultValue={initial.smtpFromEmail ?? ""}
                required
                placeholder="hallo@dein-studio.de"
                className="input"
              />
            </Field>
            <Field label="Absender-Name" hint={'z.B. „Lisa Boudoir"'}>
              <input
                name="smtpFromName"
                defaultValue={initial.smtpFromName ?? ""}
                placeholder="Studio-Name"
                className="input"
              />
            </Field>
          </FormRow>

          <label className="flex items-start gap-2 text-sm cursor-pointer pt-2">
            <input
              type="checkbox"
              name="emailNotifyDefault"
              defaultChecked={initial.emailNotifyDefault}
              className="w-4 h-4 mt-0.5"
            />
            <div>
              <div className="font-medium">Kundinnen standardmäßig benachrichtigen</div>
              <div className="text-xs text-smoke mt-0.5">
                Bei Aktionen wie „neuer Termin" wird die Email-Checkbox automatisch
                aktiviert — du kannst sie pro Action immer noch manuell abwählen.
              </div>
            </div>
          </label>

          <div className="pt-2 mt-2 border-t border-stone/60 space-y-2">
            <div className="eyebrow eyebrow-muted">Zahlungsbestätigungen</div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="payConfirmCustomer"
                defaultChecked={initial.payConfirmCustomer}
                className="w-4 h-4 mt-0.5"
              />
              <div>
                <div className="font-medium">Kundin bei Zahlungseingang automatisch benachrichtigen</div>
                <div className="text-xs text-smoke mt-0.5">
                  Sobald eine Rechnung auf „bezahlt" gesetzt wird (manuell oder via Stripe),
                  geht eine Bestätigungs-Mail mit Rechnungsnummer + Betrag an die Kundin.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="payConfirmOwner"
                defaultChecked={initial.payConfirmOwner}
                className="w-4 h-4 mt-0.5"
              />
              <div>
                <div className="font-medium">Mich selbst bei Zahlungseingang benachrichtigen</div>
                <div className="text-xs text-smoke mt-0.5">
                  Du bekommst eine Mail an deine Absender-Adresse — praktisch für
                  Stripe-Zahlungen, die du sonst erst beim nächsten Login siehst.
                </div>
              </div>
            </label>
          </div>
        </div>

        {testResult && !testResult.ok && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-xs"
            style={{
              background: "rgb(var(--accent-soft))",
              color: "rgb(var(--accent-deep))",
              border: "1px solid rgb(var(--accent) / 0.4)",
            }}
          >
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Verbindungs-Test fehlgeschlagen</div>
              <div className="mt-0.5">{testResult.reason}</div>
            </div>
          </div>
        )}
        {testResult?.ok && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg text-xs"
            style={{
              background: "rgb(var(--success-soft))",
              color: "rgb(var(--success-deep))",
            }}
          >
            <CheckCircle2 size={14} /> SMTP-Verbindung OK
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-stone/60">
          <button
            type="button"
            disabled={testing || pending}
            onClick={(e) => onTestConnection((e.currentTarget.closest("form") as HTMLFormElement))}
            className="btn-secondary text-sm h-9"
          >
            <TestTube size={13} /> Verbindung testen
          </button>
          {initial.hasSmtpPassword && (
            <button
              type="button"
              disabled={testing || pending}
              onClick={onTestSend}
              className="btn-ghost text-sm h-9"
            >
              <Mail size={13} /> Test-Mail an mich
            </button>
          )}
          <button type="submit" disabled={pending} className="btn-primary text-sm h-9">
            <Save size={13} /> {pending ? "Speichert…" : "Speichern"}
          </button>
        </div>
      </section>
    </form>
  );
}
