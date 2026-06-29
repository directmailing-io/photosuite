"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { updateShootingMeta } from "../actions";

type Customer = { id: string; firstName: string; lastName: string };
type Status = { id: string; label: string; color: string };

/**
 * Header für die Shooting-Detail-Page mit direkt editierbarem Titel, Kundin und Status.
 * Klick auf Pencil-Icon öffnet Inline-Edit-Mode mit Save/Cancel. Save speichert direkt
 * via Server-Action (kein Form-Submit der Seite).
 *
 * UX-Entscheidung: Edit-Mode statt Always-Editable, damit Lisa nicht versehentlich
 * Felder ändert beim Hovern oder Tab-Wechseln.
 */
export function ShootingHeaderInlineEdit({
  shootingId,
  eyebrow,
  initial,
  customers,
  statuses,
  actions,
}: {
  shootingId: string;
  eyebrow: string;
  initial: {
    title: string;
    customerId: string;
    statusId: string | null;
  };
  customers: Customer[];
  statuses: Status[];
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [statusId, setStatusId] = useState<string>(initial.statusId ?? "");

  const customer = customers.find((c) => c.id === customerId);
  const status = statuses.find((s) => s.id === statusId);

  function cancel() {
    setTitle(initial.title);
    setCustomerId(initial.customerId);
    setStatusId(initial.statusId ?? "");
    setEditing(false);
  }

  function save() {
    startTransition(async () => {
      try {
        await updateShootingMeta(shootingId, {
          title: title !== initial.title ? title : undefined,
          customerId: customerId !== initial.customerId ? customerId : undefined,
          statusId: statusId !== (initial.statusId ?? "") ? (statusId || null) : undefined,
        });
        toast.success("Gespeichert");
        setEditing(false);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler beim Speichern");
      }
    });
  }

  if (!editing) {
    return (
      <header className="mb-8 group">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="eyebrow eyebrow-muted">{eyebrow}</div>
            <h1 className="font-serif text-4xl mt-1 leading-tight">{title}</h1>
            <div className="flex items-center gap-2 mt-2 text-sm">
              <span className="text-smoke">{customer ? `${customer.firstName} ${customer.lastName}` : "—"}</span>
              {status && <StatusBadge label={status.label} color={status.color} />}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-ghost text-xs gap-1.5 opacity-60 hover:opacity-100"
              title="Eckdaten bearbeiten"
            >
              <Pencil size={13} /> Bearbeiten
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="mb-8 card p-5 space-y-3" style={{ borderColor: "rgb(var(--accent))" }}>
      <div className="eyebrow eyebrow-muted">Eckdaten bearbeiten</div>

      <div>
        <label className="label">Titel</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input"
          placeholder="z.B. Boudoir-Shooting Anna"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Kundin</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="select">
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select value={statusId} onChange={(e) => setStatusId(e.target.value)} className="select">
            <option value="">— ohne Status —</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={cancel} disabled={pending} className="btn-ghost text-sm">
          <X size={13} /> Abbrechen
        </button>
        <button type="button" onClick={save} disabled={pending || !title.trim()} className="btn-accent text-sm">
          <Check size={13} /> {pending ? "Speichert…" : "Speichern"}
        </button>
      </div>
    </header>
  );
}
