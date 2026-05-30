"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, Cake, Phone, Mail, Heart } from "lucide-react";
import { Field, FormRow } from "@/components/form/Field";
import { Avatar } from "@/components/Avatar";
import { toast } from "sonner";
import { createCompanion, updateCompanion, deleteCompanion } from "../actions";

export type Companion = {
  id: string;
  firstName: string;
  lastName: string | null;
  relationship: string | null;
  birthday: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

function calcAge(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function CompanionsSection({
  customerId, companions,
}: { customerId: string; companions: Companion[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Schmaler Empty-State: ein dezenter Aufforderungs-Streifen statt 100px Karte.
  if (companions.length === 0 && !adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="w-full card px-5 py-3 flex items-center gap-3 text-sm text-smoke hover:text-ink hover:bg-linen/40 transition"
      >
        <Heart size={14} className="text-taupe" />
        <span className="flex-1 text-left">
          Begleitperson hinzufügen
          <span className="text-xs ml-1.5 opacity-70">— z.B. Partner:in oder Familienmitglied</span>
        </span>
        <Plus size={14} />
      </button>
    );
  }

  return (
    <div className="card">
      <div className="px-6 py-4 flex items-center justify-between border-b border-stone/60">
        <div className="eyebrow eyebrow-muted flex items-center gap-2">
          <Heart size={13} /> Begleitpersonen
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="text-xs text-ink hover:underline flex items-center gap-1"
          >
            <Plus size={13} /> Hinzufügen
          </button>
        )}
      </div>

      <ul className="divide-y divide-stone/60">
        {companions.map((c) => (
          <li key={c.id} className="px-6 py-4 group">
            {editingId === c.id ? (
              <CompanionForm
                customerId={customerId}
                companion={c}
                onClose={() => setEditingId(null)}
              />
            ) : (
              <CompanionRow
                companion={c}
                onEdit={() => { setEditingId(c.id); setAdding(false); }}
              />
            )}
          </li>
        ))}
        {adding && (
          <li className="px-6 py-4 bg-linen/30">
            <CompanionForm
              customerId={customerId}
              companion={null}
              onClose={() => setAdding(false)}
            />
          </li>
        )}
      </ul>
    </div>
  );
}

function CompanionRow({ companion, onEdit }: { companion: Companion; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const age = calcAge(companion.birthday);

  function onDelete() {
    if (!confirm(`${companion.firstName}${companion.lastName ? " " + companion.lastName : ""} entfernen?`)) return;
    startTransition(async () => {
      try {
        await deleteCompanion(companion.id);
        toast.success("Entfernt");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar firstName={companion.firstName} lastName={companion.lastName ?? undefined} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
          <div className="font-medium">
            {companion.firstName} {companion.lastName ?? ""}
          </div>
          {companion.relationship && (
            <span className="text-xs text-smoke">· {companion.relationship}</span>
          )}
          {age !== null && (
            <span className="text-xs text-smoke">· {age} Jahre</span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-smoke mt-1">
          {companion.email && (
            <a href={`mailto:${companion.email}`} className="hover:text-ink flex items-center gap-1">
              <Mail size={11} /> {companion.email}
            </a>
          )}
          {companion.phone && (
            <a href={`tel:${companion.phone}`} className="hover:text-ink flex items-center gap-1">
              <Phone size={11} /> {companion.phone}
            </a>
          )}
        </div>
        {companion.notes && (
          <div className="text-xs text-smoke mt-1.5 italic">{companion.notes}</div>
        )}
      </div>
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="btn-icon" title="Bearbeiten" disabled={pending}>
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="btn-icon" title="Entfernen" disabled={pending} style={{ color: "var(--accent)" }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function CompanionForm({
  customerId, companion, onClose,
}: {
  customerId: string;
  companion: Companion | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (companion) {
          await updateCompanion(companion.id, fd);
          toast.success("Aktualisiert");
        } else {
          await createCompanion(customerId, fd);
          toast.success("Person hinzugefügt");
        }
        router.refresh();
        onClose();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler beim Speichern");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormRow>
        <Field label="Vorname *">
          <input name="firstName" defaultValue={companion?.firstName ?? ""} className="input h-9 text-sm" required />
        </Field>
        <Field label="Nachname">
          <input name="lastName" defaultValue={companion?.lastName ?? ""} className="input h-9 text-sm" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Beziehung" hint="z.B. Partner, Kind, Mutter, Freundin">
          <input name="relationship" defaultValue={companion?.relationship ?? ""} className="input h-9 text-sm" />
        </Field>
        <Field label="Geburtstag">
          <input type="date" name="birthday" defaultValue={toDateInput(companion?.birthday ?? null)} className="input h-9 text-sm" />
        </Field>
      </FormRow>
      <FormRow>
        <Field label="E-Mail">
          <input type="email" name="email" defaultValue={companion?.email ?? ""} className="input h-9 text-sm" />
        </Field>
        <Field label="Telefon">
          <input name="phone" defaultValue={companion?.phone ?? ""} className="input h-9 text-sm" />
        </Field>
      </FormRow>
      <Field label="Notiz">
        <textarea name="notes" defaultValue={companion?.notes ?? ""} rows={2} className="textarea text-sm" placeholder="optional — z.B. Allergien, Anliegen, Gesprächsnotiz …" />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="btn-ghost text-xs h-9" disabled={pending}>
          <X size={12} /> Abbrechen
        </button>
        <button type="submit" className="btn-primary text-xs h-9" disabled={pending}>
          <Save size={12} /> {pending ? "Speichern…" : companion ? "Speichern" : "Hinzufügen"}
        </button>
      </div>
    </form>
  );
}
