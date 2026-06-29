"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Pencil, X, Package as PackageIcon, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import { createArticle, updateArticle, deleteArticle } from "./articleActions";

export type ArticleRow = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  unit: string | null;
  defaultPriceCents: number;
  isActive: boolean;
};

const KIND_LABEL: Record<string, { label: string; Icon: typeof PackageIcon }> = {
  SERVICE: { label: "Dienstleistungen", Icon: Briefcase },
  PRODUCT: { label: "Produkte", Icon: PackageIcon },
};

function fmtEUR(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function ArticleCatalogManager({ articles }: { articles: ArticleRow[] }) {
  const [adding, setAdding] = useState<"SERVICE" | "PRODUCT" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped: Array<{ kind: "SERVICE" | "PRODUCT"; items: ArticleRow[] }> = [
    { kind: "SERVICE", items: articles.filter((a) => a.kind === "SERVICE") },
    { kind: "PRODUCT", items: articles.filter((a) => a.kind === "PRODUCT") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="font-serif text-xl">Artikel-Katalog</div>
        <p className="text-sm text-smoke mt-1 max-w-2xl">
          Vorgefertigte Rechnungs-Positionen, die du beim Rechnungs-Erstellen schnell auswählen kannst.
          Dienstleistungen (z.B. „Boudoir 2h", „Make-up") und Produkte (z.B. „Bilderbuch M", „Leinwand 60×90") getrennt.
        </p>
      </div>

      {grouped.map((g) => {
        const Icon = KIND_LABEL[g.kind].Icon;
        return (
          <section key={g.kind} className="card">
            <div className="px-5 py-4 border-b border-stone/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-accent" />
                <div className="eyebrow eyebrow-muted">{KIND_LABEL[g.kind].label}</div>
                <div className="text-xs text-smoke">· {g.items.length}</div>
              </div>
              {adding !== g.kind && (
                <button
                  onClick={() => { setAdding(g.kind); setEditingId(null); }}
                  className="btn-primary text-xs h-8"
                >
                  <Plus size={12} /> Neuer Artikel
                </button>
              )}
            </div>

            {adding === g.kind && (
              <div className="px-5 py-4 bg-linen/40 border-b border-stone/60">
                <ArticleForm
                  defaultKind={g.kind}
                  onCancel={() => setAdding(null)}
                  onSaved={() => setAdding(null)}
                />
              </div>
            )}

            {g.items.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-smoke italic">
                {g.kind === "SERVICE"
                  ? 'Noch keine Dienstleistungen. Lege z.B. „Boudoir-Shooting 2h" an.'
                  : 'Noch keine Produkte. Lege z.B. „Bilderbuch M" an.'}
              </div>
            ) : (
              <ul className="divide-y divide-stone/60">
                {g.items.map((a) => (
                  <li key={a.id}>
                    {editingId === a.id ? (
                      <div className="px-5 py-4 bg-linen/40">
                        <ArticleForm
                          initial={a}
                          defaultKind={a.kind as "SERVICE" | "PRODUCT"}
                          onCancel={() => setEditingId(null)}
                          onSaved={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <ArticleRowView article={a} onEdit={() => { setEditingId(a.id); setAdding(null); }} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ArticleRowView({ article, onEdit }: { article: ArticleRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`„${article.name}" löschen?`)) return;
    startTransition(async () => {
      try {
        await deleteArticle(article.id);
        toast.success("Artikel gelöscht");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht löschen");
      }
    });
  }

  return (
    <div className="px-5 py-3 flex items-center gap-4" style={{ opacity: article.isActive ? 1 : 0.55 }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-sm">{article.name}</div>
          {!article.isActive && (
            <span className="badge" style={{ background: "rgb(var(--linen))", color: "rgb(var(--smoke))" }}>
              Inaktiv
            </span>
          )}
        </div>
        {article.description && (
          <div className="text-xs text-smoke mt-0.5 line-clamp-1">{article.description}</div>
        )}
        <div className="text-xs text-smoke mt-0.5">
          {fmtEUR(article.defaultPriceCents)} · {article.unit ?? "Pauschal"}
        </div>
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

function ArticleForm({
  initial,
  defaultKind,
  onCancel,
  onSaved,
}: {
  initial?: ArticleRow;
  defaultKind: "SERVICE" | "PRODUCT";
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
        if (initial) await updateArticle(initial.id, fd);
        else await createArticle(fd);
        toast.success(initial ? "Artikel aktualisiert" : "Artikel angelegt");
        router.refresh();
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler beim Speichern");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormRow>
        <Field label="Name *">
          <input
            name="name"
            defaultValue={initial?.name ?? ""}
            required
            maxLength={200}
            className="input"
            placeholder={defaultKind === "SERVICE" ? "z.B. Boudoir-Shooting 2 Std." : "z.B. Bilderbuch M (20×20 cm)"}
          />
        </Field>
        <Field label="Art">
          <select name="kind" defaultValue={initial?.kind ?? defaultKind} className="select">
            <option value="SERVICE">Dienstleistung</option>
            <option value="PRODUCT">Produkt</option>
          </select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label="Standardpreis (€)">
          <input
            name="defaultPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial ? (initial.defaultPriceCents / 100).toFixed(2) : ""}
            className="input"
            placeholder="0,00"
          />
        </Field>
        <Field label="Einheit">
          <input
            name="unit"
            defaultValue={initial?.unit ?? "Pauschal"}
            maxLength={30}
            className="input"
            placeholder="Pauschal, Std., Stück …"
          />
        </Field>
      </FormRow>
      <Field label="Beschreibung" hint="Optional — wird auf der Rechnung mit der Position angezeigt.">
        <textarea
          name="description"
          defaultValue={initial?.description ?? ""}
          rows={2}
          maxLength={1000}
          className="textarea text-sm"
        />
      </Field>
      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="w-4 h-4" />
          <span>Aktiv (im Rechnungs-Picker verfügbar)</span>
        </label>
      )}
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
