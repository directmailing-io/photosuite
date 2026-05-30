"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Pencil, ArrowUp, ArrowDown, Star, Package as PackageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateTemplateMeta,
  deleteTemplate,
  addTemplateField,
  updateTemplateField,
  deleteTemplateField,
  moveTemplateField,
} from "../actions";
import { FIELD_TYPES, type FieldType } from "@/lib/questionnaire";

type FieldUI = {
  id: string;
  type: string;
  label: string;
  helpText: string | null;
  required: boolean;
  options: string | null;
};

type Props = {
  templateId: string;
  initial: {
    title: string;
    description: string | null;
  };
  fields: FieldUI[];
  usedInPackages: { id: string; name: string }[];
};

export function TemplateEditor({ templateId, initial, fields, usedInPackages }: Props) {
  const router = useRouter();
  const [editingMeta, setEditingMeta] = useState(false);
  const [addingField, setAddingField] = useState(false);

  async function onSaveMeta(fd: FormData) {
    await updateTemplateMeta(templateId, fd);
    setEditingMeta(false);
    toast.success("Gespeichert");
    router.refresh();
  }
  async function onDelete() {
    if (usedInPackages.length > 0) {
      if (!confirm(`Diese Vorlage ist in ${usedInPackages.length} Paket${usedInPackages.length === 1 ? "" : "en"} verknüpft. Trotzdem löschen?\nBestehende Shooting-Bögen bleiben erhalten.`)) return;
    } else if (!confirm("Vorlage wirklich löschen?")) return;
    try { await deleteTemplate(templateId); } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error("Konnte nicht löschen");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Meta */}
        <section className="card p-5">
          <div className="flex items-start justify-between mb-2">
            <div className="eyebrow eyebrow-muted">Titel & Begrüßung</div>
            {!editingMeta && (
              <button onClick={() => setEditingMeta(true)} className="btn-icon">
                <Pencil size={13} />
              </button>
            )}
          </div>
          {editingMeta ? (
            <form
              onSubmit={(e) => { e.preventDefault(); onSaveMeta(new FormData(e.currentTarget)); }}
              className="space-y-3"
            >
              <input name="title" defaultValue={initial.title} className="input" required />
              <textarea
                name="description"
                defaultValue={initial.description ?? ""}
                rows={3}
                placeholder="Optionaler Begrüßungstext für die Kundin"
                className="textarea"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setEditingMeta(false)} className="btn-ghost">Abbrechen</button>
                <button className="btn-primary">Speichern</button>
              </div>
            </form>
          ) : (
            <>
              <div className="font-serif text-2xl">{initial.title}</div>
              {initial.description && (
                <div className="text-sm text-smoke mt-2 whitespace-pre-wrap">{initial.description}</div>
              )}
            </>
          )}
        </section>

        {/* Felder */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="eyebrow eyebrow-muted">Fragen</div>
            <button onClick={() => setAddingField(true)} className="btn-secondary text-xs h-8">
              <Plus size={13} /> Frage hinzufügen
            </button>
          </div>

          {fields.length === 0 && !addingField && (
            <div className="text-sm text-smoke text-center py-8">
              Noch keine Fragen. Klick rechts oben auf „Frage hinzufügen".
            </div>
          )}

          <ol className="space-y-3">
            {fields.map((f, idx) => (
              <FieldRow
                key={f.id}
                index={idx}
                total={fields.length}
                field={f}
                onUpdate={() => router.refresh()}
              />
            ))}
          </ol>

          {addingField && (
            <FieldForm
              onCancel={() => setAddingField(false)}
              onSubmit={async (fd) => {
                try { await addTemplateField(templateId, fd); }
                catch (e: any) { toast.error(e?.message ?? "Fehler"); return; }
                setAddingField(false);
                toast.success("Frage hinzugefügt");
                router.refresh();
              }}
            />
          )}
        </section>

        {/* Delete */}
        <div className="flex items-center justify-between">
          <button onClick={onDelete} className="btn-ghost" style={{ color: "var(--accent)" }}>
            <Trash2 size={15} /> Vorlage löschen
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-5">
        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Verknüpft mit</div>
          {usedInPackages.length === 0 ? (
            <div className="text-sm text-smoke">
              Diese Vorlage ist noch keinem Paket zugeordnet.
              <div className="text-xs mt-2">
                Du kannst sie aber jederzeit direkt am Shooting verwenden.
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {usedInPackages.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/pakete/${p.id}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-linen text-sm"
                  >
                    <PackageIcon size={14} className="text-taupe" />
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3">Tipp</div>
          <div className="text-sm text-smoke leading-relaxed">
            Eine Vorlage wird beim Shooting <strong className="text-ink">kopiert</strong> —
            spätere Änderungen an der Vorlage betreffen nur neue Shootings.
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  index, total, field, onUpdate,
}: {
  index: number; total: number; field: FieldUI; onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const typeMeta = FIELD_TYPES.find((t) => t.value === field.type);

  async function onMove(dir: "up" | "down") {
    await moveTemplateField(field.id, dir);
    onUpdate();
  }
  async function onDel() {
    if (!confirm("Frage löschen?")) return;
    await deleteTemplateField(field.id);
    onUpdate();
  }

  if (editing) {
    return (
      <li>
        <FieldForm
          initial={field}
          onCancel={() => setEditing(false)}
          onSubmit={async (fd) => {
            try { await updateTemplateField(field.id, fd); }
            catch (e: any) { toast.error(e?.message ?? "Fehler"); return; }
            setEditing(false);
            onUpdate();
          }}
        />
      </li>
    );
  }

  return (
    <li className="card p-4 group">
      <div className="flex items-start gap-3">
        <div className="text-xs text-smoke font-mono mt-1 tabular-nums w-6 shrink-0">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium text-sm">
              {field.label}
              {field.required && <span className="text-accent ml-0.5">*</span>}
            </div>
            <span className="badge" style={{ background: "var(--linen)", color: "var(--smoke)" }}>
              {typeMeta?.label ?? field.type}
            </span>
          </div>
          {field.helpText && (
            <div className="text-xs text-smoke mt-1">{field.helpText}</div>
          )}
          {(field.type === "SELECT_SINGLE" || field.type === "SELECT_MULTI") && field.options && (
            <div className="flex flex-wrap gap-1 mt-2">
              {(JSON.parse(field.options) as string[]).map((o, i) => (
                <span key={i} className="badge" style={{ background: "var(--bg)", color: "var(--smoke)", border: "1px solid var(--stone)" }}>
                  {o}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100">
          <button onClick={() => onMove("up")} disabled={index === 0} className="btn-icon h-7 w-7 disabled:opacity-30">
            <ArrowUp size={12} />
          </button>
          <button onClick={() => onMove("down")} disabled={index === total - 1} className="btn-icon h-7 w-7 disabled:opacity-30">
            <ArrowDown size={12} />
          </button>
          <button onClick={() => setEditing(true)} className="btn-icon h-7 w-7"><Pencil size={12} /></button>
          <button onClick={onDel} className="btn-icon h-7 w-7"><Trash2 size={12} /></button>
        </div>
      </div>
    </li>
  );
}

function FieldForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: FieldUI;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<FieldType>((initial?.type as FieldType) ?? "TEXT");
  const [busy, setBusy] = useState(false);
  const typeMeta = FIELD_TYPES.find((t) => t.value === type);
  const hasOptions = typeMeta?.hasOptions ?? false;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(new FormData(e.currentTarget));
        setBusy(false);
      }}
      className="card p-4 bg-linen/40 space-y-3"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Feldtyp</label>
          <select name="type" value={type} onChange={(e) => setType(e.target.value as FieldType)} className="select">
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div className="text-xs text-smoke mt-1">{typeMeta?.hint}</div>
        </div>
        <div>
          <label className="label">Frage *</label>
          <input name="label" defaultValue={initial?.label} placeholder="Wie heißt du?" className="input" required />
        </div>
      </div>

      <div>
        <label className="label">Hinweis (optional)</label>
        <input name="helpText" defaultValue={initial?.helpText ?? ""} placeholder="Kleiner Hilfetext unter der Frage" className="input" />
      </div>

      {hasOptions && (
        <div>
          <label className="label">Optionen — eine pro Zeile</label>
          <textarea
            name="options"
            defaultValue={initial?.options ? (JSON.parse(initial.options) as string[]).join("\n") : ""}
            rows={4}
            placeholder={"Option 1\nOption 2\nOption 3"}
            className="textarea"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" defaultChecked={initial?.required} className="w-4 h-4" />
        <span>Pflichtfeld</span>
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Abbrechen</button>
        <button disabled={busy} className="btn-primary">{busy ? "…" : "Speichern"}</button>
      </div>
    </form>
  );
}
