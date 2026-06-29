"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Pencil, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/form/Field";
import {
  createNoteTemplate,
  updateNoteTemplate,
  deleteNoteTemplate,
} from "./noteTemplateActions";

export type NoteTemplateRow = {
  id: string;
  name: string;
  category: string;
  body: string;
};

const CATEGORIES = [
  { key: "ALLGEMEIN", label: "Allgemein" },
  { key: "ERSTGESPRAECH", label: "Erstgespräch" },
  { key: "BILDAUSWAHL", label: "Bildauswahl" },
  { key: "RETUSCHE", label: "Retusche" },
] as const;

/**
 * UI für User-Notizen-Vorlagen. Lisa kann pro Kategorie Templates anlegen
 * (Leitfragen, Strukturen) — die werden im NotesManager beim Anlegen einer
 * Notiz als Vorlage angeboten.
 *
 * Security: Server-Actions validieren Whitelist + IDOR auf ownerId.
 * Performance: alles in einem Card, keine zusätzlichen Requests.
 */
export function NoteTemplatesManager({ templates }: { templates: NoteTemplateRow[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped = CATEGORIES.map((c) => ({
    cat: c,
    items: templates.filter((t) => t.category === c.key),
  }));

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="eyebrow eyebrow-muted flex items-center gap-2"><FileText size={11} /> Notiz-Vorlagen</div>
          <div className="text-sm text-smoke mt-1 max-w-2xl">
            Leitfragen oder Strukturen, die du beim Anlegen einer Notiz wiederverwenden willst —
            z.B. „Erstgespräch: Wie hast du mich gefunden? Welche Bilder wünschst du dir? …"
          </div>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="btn-primary text-xs h-9"
          >
            <Plus size={13} /> Neue Vorlage
          </button>
        )}
      </div>

      {adding && (
        <div className="px-6 py-5 bg-linen/40 border-b border-stone/60">
          <TemplateForm onCancel={() => setAdding(false)} onSaved={() => setAdding(false)} />
        </div>
      )}

      {templates.length === 0 && !adding ? (
        <div className="px-6 py-10 text-center text-sm text-smoke">
          Noch keine Vorlagen. Lege z.B. eine „Erstgespräch"-Vorlage mit deinen Leitfragen an.
        </div>
      ) : (
        <div className="px-6 py-4 space-y-6">
          {grouped.map((g) => (
            <section key={g.cat.key}>
              <div className="eyebrow eyebrow-muted mb-2">{g.cat.label}</div>
              {g.items.length === 0 ? (
                <div className="text-xs text-smoke italic">Keine Vorlage in dieser Phase.</div>
              ) : (
                <ul className="space-y-2">
                  {g.items.map((t) => (
                    <li key={t.id}>
                      {editingId === t.id ? (
                        <TemplateForm
                          initial={t}
                          onCancel={() => setEditingId(null)}
                          onSaved={() => setEditingId(null)}
                        />
                      ) : (
                        <TemplateRow
                          template={t}
                          onEdit={() => { setEditingId(t.id); setAdding(false); }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateRow({ template, onEdit }: { template: NoteTemplateRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Vorlage „${template.name}" löschen?`)) return;
    startTransition(async () => {
      try {
        await deleteNoteTemplate(template.id);
        toast.success("Vorlage gelöscht");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht löschen");
      }
    });
  }

  return (
    <div className="p-3 rounded-lg border bg-paper border-stone flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{template.name}</div>
        <div className="text-xs text-smoke mt-1 whitespace-pre-wrap line-clamp-3">{template.body}</div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="btn-icon" title="Bearbeiten">
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="btn-icon"
          style={{ color: "rgb(var(--accent))" }}
          title="Löschen"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function TemplateForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: NoteTemplateRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (initial) await updateNoteTemplate(initial.id, fd);
        else await createNoteTemplate(fd);
        toast.success(initial ? "Vorlage aktualisiert" : "Vorlage angelegt");
        router.refresh();
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler beim Speichern");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <Field label="Name *">
          <input
            name="name"
            defaultValue={initial?.name ?? ""}
            placeholder="z.B. Erstgespräch — Standard"
            required
            maxLength={80}
            className="input"
          />
        </Field>
        <Field label="Phase *">
          <select name="category" defaultValue={initial?.category ?? "ERSTGESPRAECH"} className="select">
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Body *"
        hint="Mehrzeilig — z.B. Leitfragen, Checkpunkte. Wird beim Anlegen einer Notiz als Vorlage geladen."
      >
        <textarea
          name="body"
          defaultValue={initial?.body ?? ""}
          required
          rows={6}
          maxLength={4000}
          placeholder={`Warum möchtest du ein Boudoir Shooting machen?\nWie möchtest du dich auf deinen Bildern sehen?\n…`}
          className="textarea text-sm"
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost text-sm">
          <X size={13} /> Abbrechen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={13} /> {pending ? "Speichern…" : initial ? "Aktualisieren" : "Anlegen"}
        </button>
      </div>
    </form>
  );
}
