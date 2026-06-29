"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Save, Send, CheckCircle2, XCircle, Hourglass, CircleSlash,
  Copy, ExternalLink, ArrowLeftRight, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { eurFromCents, eurInputFromCents } from "@/lib/money";
import { Field, FormRow } from "@/components/form/Field";
import {
  updateDraftOffer,
  issueOffer,
  withdrawOffer,
  markOfferAccepted,
  markOfferDeclined,
  deleteOfferDraft,
  convertOfferToInvoice,
} from "../actions";
import type { IssuerSnapshot } from "@/lib/invoiceSnapshot";

type Item = {
  id: string;
  title: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitPriceCents: number;
  totalCents: number;
};

type Props = {
  offer: {
    id: string;
    number: string | null;
    status: string;
    recipientName: string;
    recipientAddress: string;
    issuer: IssuerSnapshot;
    title: string;
    intro: string | null;
    notes: string | null;
    internalNote: string | null;
    issueDate: string;
    validUntil: string | null;
    isSmallBusiness: boolean;
    vatRate: number;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    sentAt: string | null;
    acceptedAt: string | null;
    declinedAt: string | null;
    declineReason: string | null;
    publicToken: string | null;
    convertedInvoice: { id: string; number: string | null } | null;
    items: Item[];
  };
};

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:     { label: "Entwurf",       color: "#9F877F", bg: "#F3EFEC" },
  SENT:      { label: "Versendet",     color: "#19191A", bg: "#EDEDEA" },
  ACCEPTED:  { label: "Angenommen",    color: "#2F6B4A", bg: "#E6F3EC" },
  DECLINED:  { label: "Abgelehnt",     color: "#C8102E", bg: "#FBE9EC" },
  EXPIRED:   { label: "Abgelaufen",    color: "#7D7878", bg: "#F2F1EE" },
  WITHDRAWN: { label: "Zurückgezogen", color: "#7D7878", bg: "#F2F1EE" },
};

export function OfferDetail({ offer }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>(offer.items);
  const [isSmallBusiness, setIsSmallBusiness] = useState(offer.isSmallBusiness);
  const [vatRate, setVatRate] = useState(offer.vatRate);

  const isDraft = offer.status === "DRAFT";
  const meta = STATUS_META[offer.status] ?? STATUS_META.DRAFT;

  const subtotal = items.reduce((s, it) => s + Math.round(it.quantity * it.unitPriceCents), 0);
  const vatAmount = isSmallBusiness ? 0 : Math.round(subtotal * (vatRate / 100));
  const total = subtotal + vatAmount;

  function addItem() {
    setItems((prev) => [...prev, {
      id: `tmp-${Date.now()}`,
      title: "",
      description: null,
      quantity: 1,
      unit: "Pauschal",
      unitPriceCents: 0,
      totalCents: 0,
    }]);
  }
  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => i === idx ? {
      ...it, ...patch,
      totalCents: Math.round((patch.quantity ?? it.quantity) * (patch.unitPriceCents ?? it.unitPriceCents)),
    } : it));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      items.forEach((it) => {
        fd.append("item.title", it.title);
        fd.append("item.description", it.description ?? "");
        fd.append("item.quantity", String(it.quantity));
        fd.append("item.unit", it.unit ?? "");
        fd.append("item.unitPrice", eurInputFromCents(it.unitPriceCents));
      });
      await updateDraftOffer(offer.id, fd);
      toast.success("Entwurf gespeichert");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally { setBusy(false); }
  }

  async function onIssue() {
    if (!confirm("Angebot jetzt versenden?\nNach dem Versand bekommt die Kundin einen Link zum Annehmen oder Ablehnen.")) return;
    setBusy(true);
    try {
      await issueOffer(offer.id);
      toast.success("Angebot versendet");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally { setBusy(false); }
  }

  async function onWithdraw() {
    if (!confirm("Angebot zurückziehen?\nDie Kundin kann es dann nicht mehr annehmen.")) return;
    setBusy(true);
    try {
      await withdrawOffer(offer.id);
      toast.success("Zurückgezogen");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function onAccept() {
    if (!confirm("Angebot manuell als angenommen markieren?")) return;
    setBusy(true);
    try {
      await markOfferAccepted(offer.id);
      toast.success("Als angenommen markiert");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function onDecline() {
    const reason = prompt("Optional: Grund für die Ablehnung");
    if (reason === null) return;
    setBusy(true);
    try {
      await markOfferDeclined(offer.id, reason);
      toast.success("Als abgelehnt markiert");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function onConvert() {
    if (!confirm("Aus diesem Angebot eine Rechnung erstellen?\nDie Positionen werden 1:1 in einen neuen Rechnungs-Entwurf kopiert.")) return;
    setBusy(true);
    try {
      await convertOfferToInvoice(offer.id);
    } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error(err?.message ?? "Fehler");
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Entwurf löschen?")) return;
    setBusy(true);
    try {
      await deleteOfferDraft(offer.id);
    } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error(err?.message ?? "Fehler");
      setBusy(false);
    }
  }

  function copyText(text: string, label = "Link") {
    navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  }

  const publicUrl = offer.publicToken
    ? (typeof window !== "undefined" ? `${window.location.origin}/k/o/${offer.publicToken}` : `/k/o/${offer.publicToken}`)
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={onSave} className="lg:col-span-2 space-y-6">
        {/* Status-Banner */}
        <div
          className="rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: meta.bg, color: meta.color }}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{meta.label}</span>
            {offer.sentAt && offer.status === "SENT" && (
              <span className="text-xs opacity-80">· seit {new Date(offer.sentAt).toLocaleDateString("de-DE")}</span>
            )}
            {offer.acceptedAt && (
              <span className="text-xs opacity-80">· am {new Date(offer.acceptedAt).toLocaleDateString("de-DE")}</span>
            )}
            {offer.declinedAt && (
              <span className="text-xs opacity-80">
                · am {new Date(offer.declinedAt).toLocaleDateString("de-DE")}
                {offer.declineReason && ` — „${offer.declineReason}"`}
              </span>
            )}
          </div>
          {offer.convertedInvoice && (
            <a
              href={`/buchhaltung/${offer.convertedInvoice.id}`}
              className="text-xs underline font-medium"
            >
              → Rechnung {offer.convertedInvoice.number ?? "(Entwurf)"}
            </a>
          )}
        </div>

        <section className="card p-5">
          <div className="eyebrow eyebrow-muted mb-4">Empfänger</div>
          <FormRow>
            <Field label="Name *">
              <input
                name="recipientName"
                defaultValue={offer.recipientName}
                disabled={!isDraft}
                required
                className="input"
              />
            </Field>
          </FormRow>
          <Field label="Anschrift" hint="Eine Zeile pro Adressfeld">
            <textarea
              name="recipientAddress"
              defaultValue={offer.recipientAddress}
              disabled={!isDraft}
              rows={3}
              className="textarea"
            />
          </Field>
        </section>

        <section className="card p-5">
          <div className="eyebrow eyebrow-muted mb-4">Kopf des Angebots</div>
          <FormRow>
            <Field label="Titel">
              <input
                name="title"
                defaultValue={offer.title}
                disabled={!isDraft}
                className="input"
                placeholder="Angebot"
              />
            </Field>
            <Field label="Datum">
              <input
                type="date"
                name="issueDate"
                defaultValue={toDateInput(offer.issueDate)}
                disabled={!isDraft}
                className="input"
              />
            </Field>
            <Field label="Gültig bis">
              <input
                type="date"
                name="validUntil"
                defaultValue={toDateInput(offer.validUntil)}
                disabled={!isDraft}
                className="input"
              />
            </Field>
          </FormRow>
          <Field label="Einleitung" hint="Optional — erscheint unter dem Titel, vor der Tabelle.">
            <textarea
              name="intro"
              defaultValue={offer.intro ?? ""}
              disabled={!isDraft}
              rows={2}
              className="textarea"
              placeholder='z.B. "Vielen Dank für dein Interesse — hier mein Vorschlag für dein Boudoir-Shooting."'
            />
          </Field>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="eyebrow eyebrow-muted">Positionen</div>
            {isDraft && (
              <button type="button" onClick={addItem} className="btn-secondary text-xs h-8">
                <Plus size={13} /> Position
              </button>
            )}
          </div>
          {items.length === 0 && (
            <div className="text-sm text-smoke text-center py-8 italic">
              Noch keine Positionen — füge eine hinzu.
            </div>
          )}
          {items.map((it, idx) => (
            <div key={it.id} className="grid grid-cols-12 gap-2 mb-2 pb-2 border-b border-stone/40 last:border-0">
              <div className="col-span-12 md:col-span-5">
                <input
                  value={it.title}
                  onChange={(e) => updateItem(idx, { title: e.target.value })}
                  disabled={!isDraft}
                  placeholder="Titel"
                  className="input"
                />
                <textarea
                  value={it.description ?? ""}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                  disabled={!isDraft}
                  placeholder="Beschreibung (optional)"
                  rows={1}
                  className="textarea text-xs mt-1"
                />
              </div>
              <div className="col-span-3 md:col-span-1">
                <input
                  type="number"
                  step="0.01"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })}
                  disabled={!isDraft}
                  className="input"
                />
              </div>
              <div className="col-span-4 md:col-span-2">
                <input
                  value={it.unit ?? ""}
                  onChange={(e) => updateItem(idx, { unit: e.target.value })}
                  disabled={!isDraft}
                  placeholder="Einheit"
                  className="input"
                />
              </div>
              <div className="col-span-4 md:col-span-2">
                <input
                  type="number"
                  step="0.01"
                  value={(it.unitPriceCents / 100).toFixed(2)}
                  onChange={(e) => updateItem(idx, { unitPriceCents: Math.round(Number(e.target.value) * 100) || 0 })}
                  disabled={!isDraft}
                  className="input text-right"
                />
              </div>
              <div className="col-span-1 md:col-span-1 text-right text-sm tabular-nums self-center">
                {eurFromCents(Math.round(it.quantity * it.unitPriceCents))}
              </div>
              <div className="col-span-12 md:col-span-1 flex justify-end">
                {isDraft && (
                  <button type="button" onClick={() => removeItem(idx)} className="btn-icon" style={{ color: "rgb(var(--accent))" }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Zusatztexte</div>
          <Field label="Hinweise/Bedingungen" hint="Erscheint unter den Positionen auf dem Angebot.">
            <textarea
              name="notes"
              defaultValue={offer.notes ?? ""}
              disabled={!isDraft}
              rows={3}
              className="textarea"
              placeholder='z.B. "Anzahlung: 30% bei Annahme. Restbetrag am Shootingtag."'
            />
          </Field>
          <Field label="Interne Notiz" hint="Nicht auf dem Angebot — nur für dich.">
            <textarea
              name="internalNote"
              defaultValue={offer.internalNote ?? ""}
              disabled={!isDraft}
              rows={2}
              className="textarea"
            />
          </Field>
          <FormRow>
            <Field label="USt-Satz (%)" hint={isSmallBusiness ? "Bei Kleinunternehmer:innen nicht relevant." : undefined}>
              <input
                type="number"
                step="0.01"
                name="vatRate"
                value={vatRate}
                onChange={(e) => setVatRate(Number(e.target.value) || 0)}
                disabled={!isDraft || isSmallBusiness}
                className="input"
              />
            </Field>
            <Field label="">
              <label className="flex items-center gap-2 text-sm mt-7 cursor-pointer">
                <input
                  type="checkbox"
                  name="isSmallBusiness"
                  checked={isSmallBusiness}
                  onChange={(e) => { setIsSmallBusiness(e.target.checked); if (e.target.checked) setVatRate(0); }}
                  disabled={!isDraft}
                  className="w-4 h-4"
                />
                <span>Kleinunternehmer (§ 19 UStG)</span>
              </label>
            </Field>
          </FormRow>
        </section>

        {isDraft && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onDelete} disabled={busy} className="btn-ghost" style={{ color: "rgb(var(--accent))" }}>
              <Trash2 size={14} /> Entwurf löschen
            </button>
            <button disabled={busy} className="btn-primary">
              <Save size={14} /> {busy ? "Speichern…" : "Entwurf speichern"}
            </button>
          </div>
        )}
      </form>

      {/* Sidebar */}
      <aside className="space-y-6">
        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Beträge</div>
          <div className="space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between"><span className="text-smoke">Netto</span><span>{eurFromCents(subtotal)}</span></div>
            {!isSmallBusiness && (
              <div className="flex justify-between"><span className="text-smoke">+ {vatRate} % USt.</span><span>{eurFromCents(vatAmount)}</span></div>
            )}
            <div className="flex justify-between font-medium text-base pt-2 mt-1 border-t border-stone">
              <span>Gesamt</span><span>{eurFromCents(total)}</span>
            </div>
            {isSmallBusiness && (
              <div className="text-xs text-smoke pt-1 italic">Gemäß § 19 UStG ohne USt.</div>
            )}
          </div>
        </div>

        {publicUrl && (offer.status === "SENT" || offer.status === "EXPIRED") && (
          <div className="card p-5 space-y-3">
            <div className="eyebrow eyebrow-muted">Annahme-Link</div>
            <div className="rounded-lg border border-stone bg-linen/40 p-2.5 text-xs font-mono break-all select-all">
              {publicUrl}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copyText(publicUrl, "Link")} className="btn-primary text-xs h-9">
                <Copy size={12} /> Kopieren
              </button>
              <a href={publicUrl} target="_blank" rel="noopener" className="btn-secondary text-xs h-9">
                <ExternalLink size={12} /> Vorschau
              </a>
            </div>
          </div>
        )}

        <div className="card p-5 space-y-2">
          <div className="eyebrow eyebrow-muted mb-1">Workflow</div>
          {isDraft && (
            <button onClick={onIssue} disabled={busy || items.length === 0} className="btn-primary w-full text-sm">
              <Send size={13} /> Angebot versenden
            </button>
          )}
          {(offer.status === "SENT" || offer.status === "EXPIRED") && (
            <>
              <button onClick={onAccept} disabled={busy} className="btn-primary w-full text-sm" style={{ background: "#2F6B4A" }}>
                <CheckCircle2 size={13} /> Manuell annehmen
              </button>
              <button onClick={onDecline} disabled={busy} className="btn-secondary w-full text-sm">
                <XCircle size={13} /> Manuell ablehnen
              </button>
              <button onClick={onWithdraw} disabled={busy} className="btn-ghost w-full text-sm">
                <CircleSlash size={13} /> Zurückziehen
              </button>
            </>
          )}
          {offer.status === "ACCEPTED" && (
            offer.convertedInvoice ? (
              <a href={`/buchhaltung/${offer.convertedInvoice.id}`} className="btn-secondary w-full text-sm justify-center">
                <ArrowLeftRight size={13} /> Rechnung öffnen
              </a>
            ) : (
              <button onClick={onConvert} disabled={busy} className="btn-primary w-full text-sm">
                <ArrowLeftRight size={13} /> In Rechnung umwandeln
              </button>
            )
          )}
        </div>
      </aside>
    </div>
  );
}
