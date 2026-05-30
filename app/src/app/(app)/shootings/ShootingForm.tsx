"use client";

import { Field, FormRow } from "@/components/form/Field";
import { TeamPicker, type TeamPickerMember } from "@/components/TeamPicker";
import { Trash2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type Customer = { id: string; firstName: string; lastName: string };
type Pkg = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  depositAmount: number | null;
  paymentTerms: string | null;
  durationMin: number | null;
  isActive: boolean;
  primaryContactId?: string | null;
  defaultTeamIds?: string[];
};
type Status = { id: string; label: string; color: string };

export type ShootingInitial = {
  id?: string;
  title?: string;
  customerId?: string;
  packageId?: string | null;
  statusId?: string | null;
  description?: string | null;
  price?: number;
  depositAmount?: number | null;
  depositPaid?: boolean;
  finalPaid?: boolean;
  paymentTerms?: string | null;
  primaryContactId?: string | null;
  teamIds?: string[];
};

type Props = {
  initial?: ShootingInitial;
  customers: Customer[];
  packages: Pkg[];
  statuses: Status[];
  team: TeamPickerMember[];
  action: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
};

export function ShootingForm({ initial, customers, packages, statuses, team, action, deleteAction }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [packageId, setPackageId] = useState<string | null>(initial?.packageId ?? null);
  const [price, setPrice] = useState<string>(initial?.price?.toString() ?? "");
  const [deposit, setDeposit] = useState<string>(initial?.depositAmount?.toString() ?? "");
  const [terms, setTerms] = useState<string>(initial?.paymentTerms ?? "");
  const [description, setDescription] = useState<string>(initial?.description ?? "");

  const activePackages = useMemo(
    () => packages.filter((p) => p.isActive || p.id === initial?.packageId),
    [packages, initial?.packageId],
  );

  function applyPackageDefaults(pid: string) {
    setPackageId(pid);
    const pkg = packages.find((p) => p.id === pid);
    if (!pkg || initial?.id) return;
    setPrice(String(pkg.price));
    setDeposit(pkg.depositAmount ? String(pkg.depositAmount) : "");
    setTerms(pkg.paymentTerms ?? "");
    if (!description) setDescription(pkg.description ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await action(new FormData(e.currentTarget));
      toast.success(initial?.id ? "Gespeichert" : "Shooting angelegt");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAction) return;
    if (!confirm("Shooting wirklich löschen?")) return;
    setBusy(true);
    try { await deleteAction(); } catch { toast.error("Konnte nicht löschen"); setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Eckdaten</div>
        <Field label="Titel *" hint={`z.B. „Boudoir-Shooting Anna"`}>
          <input name="title" defaultValue={initial?.title} className="input" required />
        </Field>
        <FormRow>
          <Field label="Kundin *">
            <select name="customerId" defaultValue={initial?.customerId ?? ""} className="select" required disabled={!!initial?.id}>
              <option value="">— wählen —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="statusId" defaultValue={initial?.statusId ?? ""} className="select">
              <option value="">— automatisch —</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
        </FormRow>
      </section>

      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Paket & Preis</div>
        <Field label="Paket" hint="Wählst du ein Paket, übernehmen wir Preis, Anzahlung, Bedingungen und Checklisten — du kannst alles überschreiben.">
          <select
            name="packageId"
            value={packageId ?? ""}
            onChange={(e) => applyPackageDefaults(e.target.value)}
            className="select"
          >
            <option value="">— ohne Paket (individuell) —</option>
            {activePackages.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(p.price)}</option>
            ))}
          </select>
        </Field>
        <FormRow>
          <Field label="Preis (€) *"><input name="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input" required /></Field>
          <Field label="Anzahlung (€)"><input name="depositAmount" type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input" /></Field>
        </FormRow>
        <Field label="Zahlungsbedingungen"><textarea name="paymentTerms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="textarea" /></Field>
        {initial?.id && (
          <FormRow>
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="depositPaid" defaultChecked={initial.depositPaid} className="w-4 h-4" />
                <span>Anzahlung erhalten</span>
              </label>
            </Field>
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="finalPaid" defaultChecked={initial.finalPaid} className="w-4 h-4" />
                <span>Restbetrag erhalten</span>
              </label>
            </Field>
          </FormRow>
        )}
      </section>

      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4 flex items-center gap-2"><UsersRound size={13} /> Team beim Shooting</div>
        <div className="text-xs text-smoke mb-4">
          Wer ist dabei? Markiere eine:n Ansprechpartner:in für die Kundin (Stern). Vorbelegt aus dem Paket — überschreibbar.
        </div>
        <TeamPicker
          members={team}
          initialPrimaryId={initial?.primaryContactId}
          initialMemberIds={initial?.teamIds}
        />
      </section>

      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4">Beschreibung für die Kundin</div>
        <Field hint="Erscheint auf der Kundenansicht. Falls leer, wird die Paket-Beschreibung verwendet.">
          <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="textarea" />
        </Field>
      </section>

      <div className="flex justify-between items-center">
        <div>
          {deleteAction && (
            <button type="button" onClick={onDelete} className="btn-ghost" style={{ color: "var(--accent)" }}>
              <Trash2 size={16} /> Löschen
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.back()} className="btn-secondary">Abbrechen</button>
          <button disabled={busy} className="btn-accent">{busy ? "Speichern…" : initial?.id ? "Speichern" : "Anlegen"}</button>
        </div>
      </div>
    </form>
  );
}
