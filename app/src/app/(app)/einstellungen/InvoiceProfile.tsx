"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormRow } from "@/components/form/Field";
import { Save, Receipt, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { updateInvoiceProfile } from "../buchhaltung/actions";

type Profile = {
  invoiceCompanyName: string | null;
  invoiceCompanyOwner: string | null;
  invoiceStreet: string | null;
  invoiceZip: string | null;
  invoiceCity: string | null;
  invoiceCountry: string | null;
  invoiceEmail: string | null;
  invoiceTaxId: string | null;
  invoiceVatId: string | null;
  isSmallBusiness: boolean;
  defaultVatRate: number;
  invoiceBankName: string | null;
  invoiceIban: string | null;
  invoiceBic: string | null;
  invoiceFooterNote: string | null;
  invoiceNumberFormat: string;
  invoicePaymentDueDays: number;
  invoiceCounter: number;
  invoiceCounterYear: number;
  reminderDays1: number;
  reminderDays2: number;
  reminderDays3: number;
  reminderFee1Cents: number;
  reminderFee2Cents: number;
  reminderFee3Cents: number;
};

export function InvoiceProfile({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isKU, setIsKU] = useState(initial.isSmallBusiness);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateInvoiceProfile(new FormData(e.currentTarget));
      toast.success("Rechnungs-Profil gespeichert");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Konnte nicht speichern");
    } finally {
      setBusy(false);
    }
  }

  const isComplete =
    !!initial.invoiceCompanyName &&
    !!initial.invoiceStreet &&
    !!initial.invoiceZip &&
    !!initial.invoiceCity &&
    (!!initial.invoiceTaxId || !!initial.invoiceVatId);

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-serif text-xl flex items-center gap-2">
            <Receipt size={18} /> Rechnungs-Profil
          </div>
          <div className="text-xs text-smoke mt-1">
            Erforderlich für jede Rechnung — Pflichtangaben nach § 14 UStG. Daten werden bei jeder
            ausgestellten Rechnung als Snapshot fixiert.
          </div>
        </div>
        {!isComplete && (
          <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)", border: "none" }}>
            <AlertCircle size={11} /> Unvollständig
          </span>
        )}
      </div>

      <FormRow>
        <Field label="Firmenname *" hint='z.B. "Lisa Steiner Photography"'>
          <input name="invoiceCompanyName" defaultValue={initial.invoiceCompanyName ?? ""} required className="input" />
        </Field>
        <Field label="Inhaber:in (optional)" hint="Wenn Einzelunternehmen mit anderem Namen">
          <input name="invoiceCompanyOwner" defaultValue={initial.invoiceCompanyOwner ?? ""} className="input" />
        </Field>
      </FormRow>

      <Field label="Straße & Hausnummer *">
        <input name="invoiceStreet" defaultValue={initial.invoiceStreet ?? ""} required className="input" />
      </Field>
      <FormRow>
        <Field label="PLZ *"><input name="invoiceZip" defaultValue={initial.invoiceZip ?? ""} required className="input" /></Field>
        <Field label="Stadt *"><input name="invoiceCity" defaultValue={initial.invoiceCity ?? ""} required className="input" /></Field>
      </FormRow>
      <FormRow>
        <Field label="Land"><input name="invoiceCountry" defaultValue={initial.invoiceCountry ?? "Deutschland"} className="input" /></Field>
        <Field label="Rechnungs-E-Mail" hint="Erscheint im PDF-Footer"><input type="email" name="invoiceEmail" defaultValue={initial.invoiceEmail ?? ""} className="input" /></Field>
      </FormRow>

      <div className="hairline pt-5 space-y-4">
        <div>
          <div className="font-medium text-sm">Steuer</div>
          <div className="text-xs text-smoke mt-1">Mindestens eine der beiden Nummern muss eingetragen sein.</div>
        </div>
        <FormRow>
          <Field label="Steuernummer" hint="z.B. 207/123/45678"><input name="invoiceTaxId" defaultValue={initial.invoiceTaxId ?? ""} className="input" /></Field>
          <Field label="USt-IdNr" hint="z.B. DE123456789 — Pflicht bei EU-Geschäft"><input name="invoiceVatId" defaultValue={initial.invoiceVatId ?? ""} className="input" /></Field>
        </FormRow>
        <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "var(--linen)" }}>
          <input
            id="isSmallBusiness"
            type="checkbox"
            name="isSmallBusiness"
            checked={isKU}
            onChange={(e) => setIsKU(e.target.checked)}
            className="w-4 h-4 mt-1"
          />
          <label htmlFor="isSmallBusiness" className="text-sm flex-1">
            <span className="font-medium">Kleinunternehmer:in nach § 19 UStG</span>
            <div className="text-xs text-smoke mt-1">
              {isKU
                ? `Auf Rechnungen wird KEINE Umsatzsteuer ausgewiesen. Pflichthinweis "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet." erscheint automatisch.`
                : "Rechnungen weisen Umsatzsteuer separat aus."}
            </div>
          </label>
        </div>
        {!isKU && (
          <Field label="Standard-Steuersatz" hint="Wird bei neuen Rechnungen vorbelegt, pro Rechnung änderbar.">
            <select name="defaultVatRate" defaultValue={initial.defaultVatRate} className="select w-40">
              <option value="19">19 % (Regelsatz)</option>
              <option value="7">7 % (ermäßigt)</option>
              <option value="0">0 %</option>
            </select>
          </Field>
        )}
      </div>

      <div className="hairline pt-5 space-y-4">
        <div className="font-medium text-sm">Bankverbindung (für PDF-Footer)</div>
        <FormRow>
          <Field label="Bank"><input name="invoiceBankName" defaultValue={initial.invoiceBankName ?? ""} className="input" /></Field>
          <Field label="BIC"><input name="invoiceBic" defaultValue={initial.invoiceBic ?? ""} className="input" /></Field>
        </FormRow>
        <Field label="IBAN"><input name="invoiceIban" defaultValue={initial.invoiceIban ?? ""} placeholder="DE89 3704 0044 0532 0130 00" className="input font-mono" /></Field>
      </div>

      <div className="hairline pt-5 space-y-4">
        <div className="font-medium text-sm">Nummern & Fristen</div>
        <FormRow>
          <Field
            label="Nummernformat"
            hint={`Tokens: {YYYY} {YY} {MM} {####}. Nächste Nummer wird daraus generiert.`}
          >
            <input name="invoiceNumberFormat" defaultValue={initial.invoiceNumberFormat} className="input font-mono" />
            <div className="text-xs text-smoke mt-1.5">
              Letzter Zähler: <strong>{initial.invoiceCounter}</strong> (Jahr {initial.invoiceCounterYear || "—"})
            </div>
          </Field>
          <Field label="Standard-Zahlungsziel (Tage)">
            <input name="invoicePaymentDueDays" type="number" min="0" defaultValue={initial.invoicePaymentDueDays} className="input w-32" />
          </Field>
        </FormRow>
        <Field label="Fußzeilen-Hinweis (optional)" hint='z.B. "Vielen Dank für deine Buchung."'>
          <textarea name="invoiceFooterNote" defaultValue={initial.invoiceFooterNote ?? ""} rows={2} className="textarea" />
        </Field>
      </div>

      <div className="hairline pt-5 space-y-4">
        <div>
          <div className="font-medium text-sm">Mahnwesen</div>
          <div className="text-xs text-smoke mt-1">
            Frist beginnt jeweils ab Erstellung der vorherigen Stufe. Gebühren werden in der Mahnung als zusätzliche Position ausgewiesen.
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ReminderRow
            label="Zahlungserinnerung"
            sub="Tage nach Fälligkeit"
            days={initial.reminderDays1}
            fee={initial.reminderFee1Cents}
            daysName="reminderDays1"
            feeName="reminderFee1"
          />
          <ReminderRow
            label="1. Mahnung"
            sub="Tage nach Erinnerung"
            days={initial.reminderDays2}
            fee={initial.reminderFee2Cents}
            daysName="reminderDays2"
            feeName="reminderFee2"
          />
          <ReminderRow
            label="2. Mahnung"
            sub="Tage nach 1. Mahnung"
            days={initial.reminderDays3}
            fee={initial.reminderFee3Cents}
            daysName="reminderDays3"
            feeName="reminderFee3"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button disabled={busy} className="btn-primary">
          <Save size={14} /> {busy ? "Speichern…" : "Profil speichern"}
        </button>
      </div>
    </form>
  );
}

function ReminderRow({
  label, sub, days, fee, daysName, feeName,
}: {
  label: string; sub: string; days: number; fee: number; daysName: string; feeName: string;
}) {
  const eurValue = (fee / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="card p-3 bg-linen/30">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[10px] text-smoke mt-0.5">{sub}</div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <label className="text-[10px] text-smoke">TAGE</label>
          <input
            name={daysName}
            type="number"
            min="0"
            defaultValue={days}
            className="input h-9 text-sm text-right tabular-nums"
          />
        </div>
        <div>
          <label className="text-[10px] text-smoke">GEBÜHR (€)</label>
          <input
            name={feeName}
            defaultValue={eurValue}
            className="input h-9 text-sm text-right tabular-nums"
            placeholder="0,00"
          />
        </div>
      </div>
    </div>
  );
}
