"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Save, FileText, Send, CircleSlash, CheckCircle2,
  AlertCircle, Download, ExternalLink, ArrowLeftRight, ChevronDown, ChevronRight,
  Bell, AlertTriangle, FileWarning, CreditCard, Copy, Hourglass, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { eurFromCents, eurInputFromCents } from "@/lib/money";
import { Field, FormRow } from "@/components/form/Field";
import {
  updateDraftInvoice, issueInvoice, markInvoicePaid, markInvoiceSent, cancelInvoice,
  createReminder,
} from "../actions";
import { sendInvoiceByEmail } from "./sendActions";
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

type Reminder = {
  id: string;
  level: number;
  feeCents: number;
  newDueDate: string;
  issuedAt: string;
};

type Props = {
  invoice: {
    id: string;
    number: string | null;
    kind: string;
    status: string;
    recipientName: string;
    recipientAddress: string;
    issuer: IssuerSnapshot;
    issueDate: string;
    serviceDate: string | null;
    serviceDateEnd: string | null;
    dueDate: string;
    subtotalCents: number;
    vatRate: number;
    vatAmountCents: number;
    totalCents: number;
    prepaidCents: number;
    amountDueCents: number;
    isSmallBusiness: boolean;
    internalNote: string | null;
    paidAt: string | null;
    sentAt: string | null;
    reminderLevel: number;
    reminders: Reminder[];
    items: Item[];
    cancelsInvoice: { id: string; number: string | null } | null;
    cancelledByInvoice: { id: string; number: string | null } | null;
    paymentLinkEnabled: boolean;
    paymentToken: string | null;
    stripeSessionUrl: string | null;
    stripeSessionExpiresAt: string | null;
    stripePaymentStatus: string | null;
    stripePaymentMethod: string | null;
  };
  reminderConfig: {
    days1: number; days2: number; days3: number;
    fee1Cents: number; fee2Cents: number; fee3Cents: number;
  };
  stripeReady: boolean;
  catalog: CatalogArticle[];
};

export type CatalogArticle = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  unit: string | null;
  defaultPriceCents: number;
};

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const REMINDER_LABELS = ["Keine", "Zahlungserinnerung", "1. Mahnung", "2. Mahnung"];

export function InvoiceDetail({ invoice, reminderConfig, stripeReady, catalog }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>(invoice.items);
  // KU-State live, damit USt-Satz dynamisch reagiert
  const [isSmallBusiness, setIsSmallBusiness] = useState(invoice.isSmallBusiness);
  const [vatRate, setVatRate] = useState(invoice.vatRate);

  const isDraft = invoice.status === "DRAFT";
  const isCancelled = invoice.status === "CANCELLED";
  const isCancelInvoice = invoice.kind === "CANCEL";

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
      ...it,
      ...patch,
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
      await updateDraftInvoice(invoice.id, fd);
      toast.success("Entwurf gespeichert");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally { setBusy(false); }
  }

  async function onIssue() {
    if (!confirm("Rechnung jetzt ausstellen?\nNach dem Ausstellen kann die Rechnung nicht mehr verändert werden — Korrekturen nur via Stornorechnung möglich.")) return;
    setBusy(true);
    try {
      await issueInvoice(invoice.id);
      toast.success("Rechnung ausgestellt");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Konnte nicht ausstellen");
    } finally { setBusy(false); }
  }

  async function onCancel() {
    if (isDraft) {
      if (!confirm("Entwurf löschen?")) return;
    } else {
      if (!confirm("Diese Rechnung stornieren?\nEs wird automatisch eine Stornorechnung mit negativen Beträgen ausgestellt.")) return;
    }
    setBusy(true);
    try {
      await cancelInvoice(invoice.id);
    } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error(err?.message ?? "Fehler");
      setBusy(false);
    }
  }

  async function onMarkPaid() {
    setBusy(true);
    try {
      await markInvoicePaid(invoice.id);
      toast.success("Als bezahlt markiert");
      router.refresh();
    } finally { setBusy(false); }
  }
  async function onMarkSent() {
    setBusy(true);
    try {
      await markInvoiceSent(invoice.id);
      toast.success("Als versendet markiert");
      router.refresh();
    } finally { setBusy(false); }
  }

  function copyText(text: string, label = "Link") {
    navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  }

  async function onCreateReminder(level: number) {
    const labels = ["", "Zahlungserinnerung", "1. Mahnung", "2. Mahnung"];
    if (!confirm(`${labels[level]} jetzt erstellen?\nWird mit fortlaufender Nummer registriert und kann als PDF heruntergeladen werden.`)) return;
    setBusy(true);
    try {
      await createReminder(invoice.id, level);
      toast.success(`${labels[level]} erstellt`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally { setBusy(false); }
  }

  // Verzug-Berechnung
  const now = new Date();
  const due = new Date(invoice.dueDate);
  const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400_000);
  const isOverdue = invoice.status === "ISSUED" && daysOverdue > 0;
  const nextReminderLevel = invoice.reminderLevel + 1;
  const canCreateReminder = invoice.status === "ISSUED" && !isCancelInvoice && nextReminderLevel <= 3;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={onSave} className="lg:col-span-2 space-y-6">
        {isCancelInvoice && invoice.cancelsInvoice && (
          <div className="card p-4 flex items-start gap-3" style={{ background: "rgb(var(--accent-soft))", borderLeftWidth: 3, borderLeftColor: "rgb(var(--accent))" }}>
            <ArrowLeftRight size={18} className="text-accent mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-medium">Stornorechnung</div>
              <div className="text-smoke text-xs mt-0.5">
                Storniert Rechnung{" "}
                <Link href={`/buchhaltung/${invoice.cancelsInvoice.id}`} className="text-ink font-mono hover:underline">
                  {invoice.cancelsInvoice.number}
                </Link> mit umgekehrten Vorzeichen.
              </div>
            </div>
          </div>
        )}
        {invoice.cancelledByInvoice && (
          <div className="card p-4 flex items-start gap-3" style={{ background: "rgb(var(--linen))" }}>
            <CircleSlash size={18} className="text-smoke mt-0.5 shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-medium">Diese Rechnung wurde storniert</div>
              <div className="text-smoke text-xs mt-0.5">
                Storno-Rechnung:{" "}
                <Link href={`/buchhaltung/${invoice.cancelledByInvoice.id}`} className="text-ink font-mono hover:underline">
                  {invoice.cancelledByInvoice.number}
                </Link>
              </div>
            </div>
          </div>
        )}

        <section className="card p-5 space-y-4">
          <div className="eyebrow eyebrow-muted">Empfänger</div>
          <Field label="Name">
            <input name="recipientName" defaultValue={invoice.recipientName} disabled={!isDraft} className="input" />
          </Field>
          <Field label="Anschrift" hint="Mehrzeilig möglich">
            <textarea name="recipientAddress" defaultValue={invoice.recipientAddress} disabled={!isDraft} rows={4} className="textarea" />
          </Field>
        </section>

        <section className="card p-5 space-y-4">
          <div className="eyebrow eyebrow-muted">Daten</div>
          <FormRow>
            <Field label="Rechnungsdatum">
              <input type="date" name="issueDate" defaultValue={toDateInput(invoice.issueDate)} disabled={!isDraft} className="input" />
            </Field>
            <Field label="Zahlbar bis">
              <input type="date" name="dueDate" defaultValue={toDateInput(invoice.dueDate)} disabled={!isDraft} className="input" />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Leistungsdatum" hint="Tag der Leistung oder Beginn des Zeitraums">
              <input type="date" name="serviceDate" defaultValue={toDateInput(invoice.serviceDate)} disabled={!isDraft} className="input" />
            </Field>
            <Field label="Leistungsdatum bis (optional)">
              <input type="date" name="serviceDateEnd" defaultValue={toDateInput(invoice.serviceDateEnd)} disabled={!isDraft} className="input" />
            </Field>
          </FormRow>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div className="eyebrow eyebrow-muted">Positionen</div>
            {isDraft && (
              <div className="flex items-center gap-2">
                <ArticlePicker
                  catalog={catalog}
                  onPick={(a) => {
                    setItems((prev) => [...prev, {
                      id: `tmp-${Date.now()}`,
                      title: a.name,
                      description: a.description,
                      quantity: 1,
                      unit: a.unit ?? "Pauschal",
                      unitPriceCents: a.defaultPriceCents,
                      totalCents: a.defaultPriceCents,
                    }]);
                  }}
                />
                <button type="button" onClick={addItem} className="btn-secondary text-xs h-8">
                  <Plus size={13} /> Leere Position
                </button>
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-smoke text-center py-6">Noch keine Positionen.</div>
          ) : (
            <div className="space-y-3">
              {items.map((it, i) => (
                <ItemRow
                  key={it.id}
                  index={i}
                  item={it}
                  isDraft={isDraft}
                  onUpdate={(patch) => updateItem(i, patch)}
                  onRemove={() => removeItem(i)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="card p-5">
          <div className="eyebrow eyebrow-muted mb-4">Steuer</div>
          <FormRow>
            <Field label="USt-Satz (%)" hint={isSmallBusiness ? "Bei Kleinunternehmer:innen nicht relevant." : undefined}>
              <input
                name="vatRate"
                type="number"
                step="0.5"
                value={vatRate}
                onChange={(e) => setVatRate(Number(e.target.value) || 0)}
                disabled={!isDraft || isSmallBusiness}
                className="input w-32"
              />
            </Field>
            <Field>
              <label className="flex items-center gap-2 text-sm pt-7">
                <input
                  type="checkbox"
                  name="isSmallBusiness"
                  checked={isSmallBusiness}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsSmallBusiness(checked);
                    // Wenn KU aus → vatRate auf Default zurücksetzen (sonst bleibt er auf 0).
                    // Wenn KU ein → vatRate auf 0 (sonst bleibt evtl. ein alter 19-Wert stehen).
                    if (checked) {
                      setVatRate(0);
                    } else if (vatRate === 0) {
                      setVatRate(19);
                    }
                  }}
                  disabled={!isDraft}
                  className="w-4 h-4"
                />
                <span>Kleinunternehmer-Hinweis (§ 19 UStG)</span>
              </label>
            </Field>
          </FormRow>
        </section>

        <section className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Interne Notiz</div>
          <Field hint="Erscheint NICHT auf der Rechnung — nur für dich.">
            <textarea name="internalNote" defaultValue={invoice.internalNote ?? ""} disabled={!isDraft} rows={2} className="textarea" />
          </Field>
        </section>

        {invoice.kind !== "CANCEL" && (
          <section className="card p-5">
            <div className="eyebrow eyebrow-muted mb-3">Online-Bezahlung</div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="paymentLinkEnabled"
                defaultChecked={invoice.paymentLinkEnabled}
                disabled={!isDraft}
                className="w-4 h-4 mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">Bezahllink generieren</div>
                <div className="text-xs text-smoke mt-0.5">
                  Wenn deaktiviert: Kein Stripe-Bezahllink, kein Hinweis auf der
                  Rechnung — Zahlung läuft manuell über Überweisung. Nützlich für
                  Bar- oder Vorab-Zahlungen.
                </div>
              </div>
            </label>
          </section>
        )}

        {isDraft && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="btn-ghost" style={{ color: "rgb(var(--accent))" }} disabled={busy}>
              <Trash2 size={15} /> Entwurf löschen
            </button>
            <button disabled={busy} className="btn-primary">
              <Save size={14} /> {busy ? "Speichern…" : "Entwurf speichern"}
            </button>
          </div>
        )}
      </form>

      {/* Sidebar */}
      <div className="space-y-4 lg:sticky lg:top-6 self-start">
        {/* Verzug-Banner */}
        {isOverdue && invoice.status !== "PAID" && (
          <div className="card p-4" style={{ background: "rgb(var(--accent-soft))", borderLeftWidth: 3, borderLeftColor: "rgb(var(--accent))" }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-accent shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-accent-deep">{daysOverdue} {daysOverdue === 1 ? "Tag" : "Tage"} überfällig</div>
                <div className="text-xs text-smoke mt-0.5">Fällig war {new Date(invoice.dueDate).toLocaleDateString("de-DE")}</div>
                {invoice.reminderLevel > 0 && (
                  <div className="text-xs text-ink mt-1.5 font-medium">
                    Aktuelle Stufe: {REMINDER_LABELS[invoice.reminderLevel]}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Summe</div>
          {!isSmallBusiness && (
            <>
              <Row label="Netto" value={eurFromCents(isDraft ? subtotal : invoice.subtotalCents)} />
              <Row label={`+ ${vatRate}% USt`} value={eurFromCents(isDraft ? vatAmount : invoice.vatAmountCents)} />
            </>
          )}
          <Row label="Gesamt" value={eurFromCents(isDraft ? total : invoice.totalCents)} bold large />
          {invoice.prepaidCents > 0 && (
            <>
              <Row label="./. bereits gezahlt" value={`-${eurFromCents(invoice.prepaidCents)}`} muted />
              <Row label="Noch zu zahlen" value={eurFromCents(invoice.amountDueCents)} bold large accent />
            </>
          )}
          {isSmallBusiness && (
            <div className="text-xs text-smoke mt-3 italic">
              Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.
            </div>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <div className="eyebrow eyebrow-muted">PDF</div>
          <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" className="btn-secondary w-full">
            <ExternalLink size={14} /> PDF ansehen
          </a>
          <a href={`/api/invoices/${invoice.id}/pdf`} download className="btn-secondary w-full">
            <Download size={14} /> Download
          </a>

          {(invoice.cancelledByInvoice || invoice.cancelsInvoice) && (
            <>
              <div className="border-t border-stone/60 pt-3 mt-1">
                <div className="text-[10px] uppercase tracking-wider text-smoke mb-2">
                  Storno-Beleg
                </div>
                <a
                  href={`/api/invoices/${(invoice.cancelledByInvoice ?? invoice.cancelsInvoice)!.id}/pdf`}
                  download
                  className="btn-secondary w-full"
                >
                  <Download size={14} />
                  {isCancelInvoice ? "Original-Rechnung" : "Stornorechnung"}
                  {(invoice.cancelledByInvoice ?? invoice.cancelsInvoice)?.number && (
                    <span className="font-mono text-xs text-smoke ml-1">
                      {(invoice.cancelledByInvoice ?? invoice.cancelsInvoice)!.number}
                    </span>
                  )}
                </a>
              </div>
              <a
                href={`/api/invoices/${invoice.id}/pdf/combined`}
                download
                className="btn-primary w-full"
                title="Originalrechnung und Stornorechnung in einer PDF-Datei — für die Buchhaltung"
              >
                <Download size={14} /> Beleg-Paket (beide)
              </a>
            </>
          )}
        </div>

        {/* Online-Zahlung (Stripe) — nur bei ISSUED und ohne CANCEL */}
        {invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && !isCancelInvoice && (
          <PaymentCard invoice={invoice} stripeReady={stripeReady} onCopy={copyText} />
        )}

        <div className="card p-5 space-y-3">
          <div className="eyebrow eyebrow-muted">Status</div>
          {isDraft && (
            <>
              <button onClick={onIssue} disabled={busy} className="btn-accent w-full">
                <FileText size={14} /> Rechnung ausstellen
              </button>
              <div className="text-xs text-smoke">Vergibt fortlaufende Nummer · macht Rechnung immutable</div>
            </>
          )}
          {invoice.status === "ISSUED" && !isCancelled && (
            <>
              <button
                onClick={async () => {
                  if (!confirm("Rechnung per E-Mail an die Kundin schicken (mit PDF im Anhang)?")) return;
                  setBusy(true);
                  try {
                    await sendInvoiceByEmail(invoice.id);
                    toast.success("Rechnung per Mail verschickt", {
                      description: "Anhang als PDF + Status aktualisiert.",
                    });
                    router.refresh();
                  } catch (err: any) {
                    toast.error("Versand fehlgeschlagen", { description: err?.message ?? "" });
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="btn-accent w-full"
              >
                <Mail size={14} /> Per E-Mail versenden
              </button>
              {!invoice.sentAt && (
                <button onClick={onMarkSent} disabled={busy} className="btn-secondary w-full">
                  <Send size={14} /> Manuell als versendet markieren
                </button>
              )}
              {invoice.sentAt && (
                <div className="text-xs text-smoke flex items-center gap-1">
                  <Send size={11} /> Versendet am {new Date(invoice.sentAt).toLocaleDateString("de-DE")}
                </div>
              )}
              <button onClick={onMarkPaid} disabled={busy} className="btn-primary w-full">
                <CheckCircle2 size={14} /> Als bezahlt markieren
              </button>
              {!isCancelInvoice && (
                <button onClick={onCancel} disabled={busy} className="btn-ghost w-full" style={{ color: "rgb(var(--accent))" }}>
                  <CircleSlash size={14} /> Stornieren
                </button>
              )}
            </>
          )}
          {invoice.status === "PAID" && invoice.paidAt && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "rgb(var(--success-deep))" }}>
              <CheckCircle2 size={15} style={{ color: "rgb(var(--success))" }} />
              <span>Bezahlt am {new Date(invoice.paidAt).toLocaleDateString("de-DE")}</span>
            </div>
          )}
          {isCancelled && (
            <div className="flex items-center gap-2 text-sm text-smoke">
              <CircleSlash size={15} />
              <span>Storniert</span>
            </div>
          )}
        </div>

        {/* Mahnwesen */}
        {!isCancelInvoice && invoice.status === "ISSUED" && (
          <div className="card p-5 space-y-3">
            <div className="eyebrow eyebrow-muted flex items-center gap-2">
              <Bell size={13} /> Mahnwesen
            </div>

            {invoice.reminders.length > 0 && (
              <ul className="space-y-2">
                {invoice.reminders.map((r) => (
                  <li key={r.id} className="text-xs p-2 rounded-lg bg-linen/60">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{REMINDER_LABELS[r.level]}</span>
                      <a
                        href={`/api/reminders/${r.id}/pdf`}
                        target="_blank"
                        className="text-accent hover:underline"
                      >
                        PDF
                      </a>
                    </div>
                    <div className="text-smoke mt-0.5">
                      Erstellt {new Date(r.issuedAt).toLocaleDateString("de-DE")} · neue Frist: {new Date(r.newDueDate).toLocaleDateString("de-DE")}
                      {r.feeCents > 0 && ` · Gebühr ${eurFromCents(r.feeCents)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canCreateReminder && (
              <>
                {nextReminderLevel === 1 && (
                  <button onClick={() => onCreateReminder(1)} disabled={busy} className="btn-secondary w-full text-xs">
                    <Bell size={13} /> Zahlungserinnerung erstellen
                    {reminderConfig.fee1Cents > 0 && ` (+${eurFromCents(reminderConfig.fee1Cents)})`}
                  </button>
                )}
                {nextReminderLevel === 2 && (
                  <button onClick={() => onCreateReminder(2)} disabled={busy} className="btn-secondary w-full text-xs">
                    <FileWarning size={13} /> 1. Mahnung erstellen
                    {reminderConfig.fee2Cents > 0 && ` (+${eurFromCents(reminderConfig.fee2Cents)})`}
                  </button>
                )}
                {nextReminderLevel === 3 && (
                  <button onClick={() => onCreateReminder(3)} disabled={busy} className="btn-accent w-full text-xs">
                    <AlertTriangle size={13} /> 2. Mahnung erstellen
                    {reminderConfig.fee3Cents > 0 && ` (+${eurFromCents(reminderConfig.fee3Cents)})`}
                  </button>
                )}
              </>
            )}
            {!canCreateReminder && invoice.reminderLevel >= 3 && (
              <div className="text-xs text-smoke text-center">
                Höchste Mahnstufe erreicht. Nächster Schritt: Inkasso oder rechtliche Schritte.
              </div>
            )}
            {!canCreateReminder && invoice.reminderLevel === 0 && !isOverdue && (
              <div className="text-xs text-smoke">
                Mahnungen werden ab Fälligkeitsdatum möglich.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemRow({
  index, item, isDraft, onUpdate, onRemove,
}: {
  index: number;
  item: Item;
  isDraft: boolean;
  onUpdate: (patch: Partial<Item>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(!!item.description);

  return (
    <div className="card p-3 bg-linen/30">
      <div className="grid grid-cols-12 gap-2 items-start">
        <div className="col-span-6">
          <label className="text-[10px] text-smoke uppercase tracking-wider">Titel *</label>
          <input
            value={item.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            disabled={!isDraft}
            className="input h-9 text-sm mt-1"
            placeholder="z.B. Boudoir-Shooting 2 Std"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-smoke uppercase tracking-wider">Menge</label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={item.quantity}
            onChange={(e) => onUpdate({ quantity: Number(e.target.value) || 0 })}
            disabled={!isDraft}
            className="input h-9 text-sm mt-1 text-right"
          />
        </div>
        <div className="col-span-1">
          <label className="text-[10px] text-smoke uppercase tracking-wider">Einheit</label>
          <input
            value={item.unit ?? ""}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            disabled={!isDraft}
            className="input h-9 text-sm mt-1"
            placeholder="Std"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-smoke uppercase tracking-wider">Einzelpreis (€)</label>
          <input
            value={eurInputFromCents(item.unitPriceCents)}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\./g, "").replace(",", ".");
              const n = Number(cleaned);
              onUpdate({ unitPriceCents: isNaN(n) ? 0 : Math.round(n * 100) });
            }}
            disabled={!isDraft}
            className="input h-9 text-sm mt-1 text-right tabular-nums"
          />
        </div>
        <div className="col-span-1 flex justify-end pt-5">
          {isDraft && (
            <button type="button" onClick={onRemove} className="btn-icon">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Optional Description */}
      <div className="mt-2">
        {expanded || item.description ? (
          <>
            <label className="text-[10px] text-smoke uppercase tracking-wider flex items-center justify-between">
              <span>Beschreibung (optional)</span>
              {isDraft && expanded && !item.description && (
                <button type="button" onClick={() => setExpanded(false)} className="text-smoke hover:text-ink normal-case tracking-normal">
                  ausblenden
                </button>
              )}
            </label>
            <textarea
              value={item.description ?? ""}
              onChange={(e) => onUpdate({ description: e.target.value || null })}
              disabled={!isDraft}
              rows={2}
              placeholder="Was umfasst die Leistung im Detail?"
              className="textarea text-sm mt-1"
            />
          </>
        ) : (
          isDraft && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-smoke hover:text-ink flex items-center gap-1"
            >
              <Plus size={11} /> Ausführliche Beschreibung
            </button>
          )
        )}
      </div>

      <div className="text-xs text-smoke text-right mt-2 tabular-nums">
        Position-Summe: {eurFromCents(Math.round(item.quantity * item.unitPriceCents))}
      </div>
    </div>
  );
}

function Row({ label, value, bold, large, muted, accent }: { label: string; value: string; bold?: boolean; large?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between py-1.5" style={{
      color: accent ? "rgb(var(--accent))" : muted ? "rgb(var(--smoke))" : "rgb(var(--ink))",
      borderTop: bold && large ? "1px solid rgb(var(--stone))" : undefined,
      marginTop: bold && large ? 4 : 0,
      paddingTop: bold && large ? 8 : 6,
    }}>
      <span className="text-sm">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold" : ""} ${large ? "text-base" : "text-sm"}`}>{value}</span>
    </div>
  );
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Kreditkarte",
  sepa_debit: "SEPA-Lastschrift",
  paypal: "PayPal",
  klarna: "Klarna",
  link: "Stripe Link",
  bancontact: "Bancontact",
  customer_balance: "Banküberweisung",
};

function PaymentCard({
  invoice, stripeReady, onCopy,
}: {
  invoice: Props["invoice"];
  stripeReady: boolean;
  onCopy: (text: string, label?: string) => void;
}) {
  const status = invoice.stripePaymentStatus;
  const publicUrl = invoice.paymentToken
    ? (typeof window !== "undefined" ? `${window.location.origin}/k/r/${invoice.paymentToken}` : `/k/r/${invoice.paymentToken}`)
    : null;

  // PAID → grüner Status statt rot
  if (invoice.status === "PAID") {
    return (
      <div className="card p-5 flex items-start gap-3" style={{ background: "rgb(var(--success-soft))", borderLeftWidth: 3, borderLeftColor: "rgb(var(--success))" }}>
        <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: "rgb(var(--success))" }} />
        <div className="text-sm">
          <div className="font-medium" style={{ color: "rgb(var(--success-deep))" }}>Online bezahlt</div>
          <div className="text-smoke text-xs mt-0.5">
            {invoice.paidAt && new Date(invoice.paidAt).toLocaleDateString("de-DE")}
            {invoice.stripePaymentMethod && ` · via ${PAYMENT_METHOD_LABELS[invoice.stripePaymentMethod] ?? invoice.stripePaymentMethod}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="eyebrow eyebrow-muted flex items-center gap-2">
        <CreditCard size={13} /> Bezahllink
      </div>

      {!invoice.paymentLinkEnabled ? (
        <div className="text-sm text-smoke">
          <CircleSlash size={13} className="inline mr-1 -mt-0.5" />
          Bezahllink für diese Rechnung deaktiviert. Die Zahlung erfolgt manuell
          (Überweisung). {invoice.status === "DRAFT" && "Im Editor wieder aktivierbar."}
        </div>
      ) : !stripeReady ? (
        <div className="text-sm text-smoke">
          Stripe noch nicht verbunden — {" "}
          <Link href="/einstellungen?tab=zahlungen" className="text-ink underline hover:text-accent">
            jetzt einrichten
          </Link>
          , um Karte / SEPA / Klarna / PayPal anzubieten.
        </div>
      ) : !publicUrl ? (
        <div className="text-sm text-smoke">
          Bezahllinks erscheinen ab dem Ausstellen einer Rechnung.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-stone bg-linen/40 p-2.5 text-xs font-mono break-all select-all">
            {publicUrl}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onCopy(publicUrl, "Bezahllink")} className="btn-primary text-xs h-9">
              <Copy size={12} /> Kopieren
            </button>
            <a href={publicUrl} target="_blank" rel="noopener" className="btn-secondary text-xs h-9">
              <ExternalLink size={12} /> Vorschau
            </a>
          </div>
          {status === "processing" && (
            <div className="text-xs flex items-center gap-1.5" style={{ color: "rgb(var(--accent-deep))" }}>
              <Hourglass size={11} /> Zahlung wurde gestartet, läuft noch
            </div>
          )}
          <div className="text-xs text-smoke pt-1">
            Karte, SEPA-Lastschrift, PayPal und Klarna (inkl. Sofortüberweisung).
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Picker für Artikel-Katalog. Zeigt SERVICE + PRODUCT in eigenen Sections,
 * mit Suchfeld zum Filtern. Beim Auswahl wird ein neues Invoice-Item mit
 * den Snapshot-Daten erzeugt (Preis, Beschreibung, Einheit).
 */
function ArticlePicker({
  catalog,
  onPick,
}: {
  catalog: CatalogArticle[];
  onPick: (a: CatalogArticle) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (catalog.length === 0) {
    return null;
  }

  const q = search.trim().toLowerCase();
  const filter = (a: CatalogArticle) =>
    !q || a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q);
  const services = catalog.filter((a) => a.kind === "SERVICE" && filter(a));
  const products = catalog.filter((a) => a.kind === "PRODUCT" && filter(a));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-accent text-xs h-8"
      >
        <Plus size={13} /> Aus Katalog
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-1 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border shadow-md"
            style={{ background: "rgb(var(--paper))", borderColor: "rgb(var(--stone))" }}
          >
            <div className="p-2 border-b border-stone/60">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen…"
                className="input h-8 text-sm"
                autoFocus
              />
            </div>
            <PickerGroup title="Dienstleistungen" items={services} onPick={(a) => { onPick(a); setOpen(false); }} />
            <PickerGroup title="Produkte" items={products} onPick={(a) => { onPick(a); setOpen(false); }} />
            {services.length === 0 && products.length === 0 && (
              <div className="text-xs text-smoke text-center py-6">Keine Treffer.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PickerGroup({
  title, items, onPick,
}: {
  title: string;
  items: CatalogArticle[];
  onPick: (a: CatalogArticle) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-smoke font-semibold">
        {title}
      </div>
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick(a)}
          className="w-full text-left px-3 py-2 hover:bg-linen transition flex items-center gap-3 border-t border-stone/40 first:border-0"
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{a.name}</div>
            {a.description && (
              <div className="text-xs text-smoke truncate">{a.description}</div>
            )}
          </div>
          <div className="text-xs tabular-nums text-smoke shrink-0">
            {(a.defaultPriceCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
          </div>
        </button>
      ))}
    </div>
  );
}
