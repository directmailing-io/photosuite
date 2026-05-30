"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Receipt, Plus, Trash2, FileText, ExternalLink, Save, CheckCircle2,
  AlertCircle, CircleDashed,
} from "lucide-react";
import { toast } from "sonner";
import { eurFromCents, eurInputFromCents } from "@/lib/money";
import { upsertPaymentSchedule, deletePaymentSchedule, createDraftInvoice } from "../../buchhaltung/actions";

type Installment = {
  id: string;
  label: string;
  kind: string;        // DEPOSIT | INTERIM | FINAL
  amountCents: number;
  dueDate: string | null;
  invoiceId: string | null;
  paidAt: string | null;
};

type InvoiceMini = {
  id: string;
  number: string | null;
  status: string;
  totalCents: number;
};

type Props = {
  shootingId: string;
  shootingPriceCents: number;
  installments: Installment[];
  invoices: Record<string, InvoiceMini>;
};

const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Anzahlung",
  INTERIM: "Teilrate",
  FINAL: "Schlussrate",
};

export function PaymentScheduleSection({ shootingId, shootingPriceCents, installments, invoices }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Installment[]>(
    installments.length > 0
      ? installments
      : [], // leeres Array — User klickt auf "Plan anlegen"
  );
  const [busy, setBusy] = useState(false);

  function addRate(kind: string = "INTERIM") {
    setDrafts((d) => [...d, {
      id: `tmp-${Date.now()}`,
      label: kind === "DEPOSIT" ? "Anzahlung" : kind === "FINAL" ? "Restbetrag" : "Teilrate",
      kind,
      amountCents: 0,
      dueDate: null,
      invoiceId: null,
      paidAt: null,
    }]);
  }

  function startNew() {
    setDrafts([
      { id: "tmp-1", label: "Anzahlung", kind: "DEPOSIT", amountCents: Math.round(shootingPriceCents * 0.3), dueDate: null, invoiceId: null, paidAt: null },
      { id: "tmp-2", label: "Restbetrag am Shootingtag", kind: "FINAL", amountCents: shootingPriceCents - Math.round(shootingPriceCents * 0.3), dueDate: null, invoiceId: null, paidAt: null },
    ]);
    setEditing(true);
  }

  function updateRate(i: number, patch: Partial<Installment>) {
    setDrafts((d) => d.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function removeRate(i: number) {
    const inst = drafts[i];
    if (inst.invoiceId) {
      toast.error("Diese Rate ist mit einer Rechnung verknüpft und kann nicht gelöscht werden.");
      return;
    }
    setDrafts((d) => d.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    setBusy(true);
    try {
      const fd = new FormData();
      drafts.forEach((r) => {
        fd.append("inst.label", r.label);
        fd.append("inst.kind", r.kind);
        fd.append("inst.amount", eurInputFromCents(r.amountCents));
        fd.append("inst.dueDate", r.dueDate ?? "");
      });
      await upsertPaymentSchedule(shootingId, fd);
      toast.success("Zahlungsplan gespeichert");
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally { setBusy(false); }
  }

  async function onDeleteSchedule() {
    if (!confirm("Zahlungsplan löschen?")) return;
    setBusy(true);
    try {
      await deletePaymentSchedule(shootingId);
      setDrafts([]);
      toast.success("Plan gelöscht");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally { setBusy(false); }
  }

  async function onCreateInvoice(installmentId: string) {
    setBusy(true);
    try {
      await createDraftInvoice({
        customerId: "",  // wird intern aus shooting geholt? nein, brauchen wir
        shootingId,
        installmentId,
        preset: "fromInstallment",
      });
    } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error(err?.message ?? "Fehler");
      setBusy(false);
    }
  }

  // Existing installments + draft state
  const display = editing ? drafts : installments;
  const planSum = display.reduce((s, r) => s + r.amountCents, 0);
  const diff = planSum - shootingPriceCents;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow eyebrow-muted flex items-center gap-2">
          <Receipt size={13} /> Zahlungsplan
        </div>
        {installments.length === 0 && !editing && (
          <button onClick={startNew} className="btn-secondary text-xs h-8">
            <Plus size={13} /> Plan anlegen
          </button>
        )}
        {installments.length > 0 && !editing && (
          <button onClick={() => { setDrafts(installments); setEditing(true); }} className="btn-ghost text-xs h-8">
            Bearbeiten
          </button>
        )}
      </div>

      {display.length === 0 && !editing && (
        <div className="text-sm text-smoke text-center py-4">
          Noch kein Zahlungsplan. Lege Anzahlung + Restbetrag fest und erstelle die Rechnungen mit einem Klick.
        </div>
      )}

      {display.length > 0 && (
        <ul className="space-y-2">
          {display.map((r, i) => {
            const inv = r.invoiceId ? invoices[r.invoiceId] : null;
            return (
              <li key={r.id} className="card p-3" style={{ background: r.paidAt ? "var(--linen)" : "var(--paper)" }}>
                {editing && !r.invoiceId ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2">
                      <select
                        value={r.kind}
                        onChange={(e) => updateRate(i, { kind: e.target.value })}
                        className="select col-span-3 h-9 text-xs"
                      >
                        <option value="DEPOSIT">Anzahlung</option>
                        <option value="INTERIM">Teilrate</option>
                        <option value="FINAL">Schlussrate</option>
                      </select>
                      <input
                        value={r.label}
                        onChange={(e) => updateRate(i, { label: e.target.value })}
                        placeholder="Beschriftung"
                        className="input col-span-5 h-9 text-sm"
                      />
                      <input
                        value={eurInputFromCents(r.amountCents)}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\./g, "").replace(",", "."));
                          updateRate(i, { amountCents: isNaN(n) ? 0 : Math.round(n * 100) });
                        }}
                        className="input col-span-3 h-9 text-sm text-right tabular-nums"
                        placeholder="0,00"
                      />
                      <button onClick={() => removeRate(i)} className="btn-icon col-span-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <input
                      type="date"
                      value={r.dueDate?.slice(0, 10) ?? ""}
                      onChange={(e) => updateRate(i, { dueDate: e.target.value || null })}
                      className="input h-8 text-xs w-40"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-6 text-xs text-smoke font-mono tabular-nums">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{r.label}</span>
                        <span className="badge" style={{ background: "var(--linen)", color: "var(--smoke)" }}>
                          {KIND_LABEL[r.kind] ?? r.kind}
                        </span>
                      </div>
                      <div className="text-xs text-smoke mt-0.5 flex items-center gap-3">
                        {r.dueDate && (
                          <span>fällig {new Date(r.dueDate).toLocaleDateString("de-DE")}</span>
                        )}
                        {inv?.number && (
                          <Link href={`/buchhaltung/${inv.id}`} className="font-mono hover:text-ink hover:underline">
                            Rg. {inv.number}
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="text-sm tabular-nums font-medium">{eurFromCents(r.amountCents)}</div>
                    <div className="flex items-center gap-1">
                      {!r.invoiceId && !editing && (
                        <button
                          onClick={() => onCreateInvoice(r.id)}
                          disabled={busy}
                          className="btn-secondary h-8 text-xs"
                          title="Rechnung aus dieser Rate erstellen"
                        >
                          <FileText size={12} /> Rechnung
                        </button>
                      )}
                      {inv && (
                        <Link href={`/buchhaltung/${inv.id}`} className="btn-icon" title="Rechnung öffnen">
                          <ExternalLink size={13} />
                        </Link>
                      )}
                      {inv?.status === "PAID" && (
                        <CheckCircle2 size={15} className="text-ink ml-1" />
                      )}
                      {inv?.status === "ISSUED" && !r.paidAt && (
                        <CircleDashed size={15} className="text-smoke ml-1" />
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <>
          <div className="hairline mt-4 pt-3 flex items-center justify-between text-xs">
            <button onClick={() => addRate()} className="btn-ghost h-8 px-2">
              <Plus size={13} /> Rate
            </button>
            <div className="text-smoke tabular-nums">
              Plan: {eurFromCents(planSum)} {diff !== 0 && (
                <span style={{ color: "var(--accent)" }}>
                  ({diff > 0 ? "+" : ""}{eurFromCents(diff)} ggü. Shooting-Preis)
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between gap-2 mt-3">
            <button
              type="button"
              onClick={onDeleteSchedule}
              className="btn-ghost text-xs"
              style={{ color: "var(--accent)" }}
              disabled={busy}
            >
              <Trash2 size={13} /> Plan löschen
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setDrafts(installments); }} className="btn-ghost text-xs">Abbrechen</button>
              <button onClick={onSave} disabled={busy} className="btn-primary text-xs h-9">
                <Save size={13} /> {busy ? "…" : "Plan speichern"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
