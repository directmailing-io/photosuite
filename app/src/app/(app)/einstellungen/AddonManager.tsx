"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, FormRow } from "@/components/form/Field";
import {
  Plus, Trash2, Pencil, Save, X, Upload, Eye, EyeOff, ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { createAddon, updateAddon, deleteAddon } from "./addonActions";

export type AddonRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  position: number;
  imageUrl: string | null;
};

function formatEUR(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function AddonManager({ addons }: { addons: AddonRow[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="px-6 py-4 flex items-center justify-between border-b border-stone/60">
        <div>
          <div className="eyebrow eyebrow-muted">Zusatzprodukte</div>
          <div className="text-sm text-smoke mt-1 max-w-md">
            Bilderbuch M, Bilderbuch L, Leinwände, Make-up — alles, was du zu deinen Paketen dazu verkaufen willst.
          </div>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditingId(null); }} className="btn-primary text-xs h-9">
            <Plus size={13} /> Neu
          </button>
        )}
      </div>

      {adding && (
        <div className="px-6 py-5 bg-linen/40 border-b border-stone/60">
          <AddonForm onClose={() => setAdding(false)} />
        </div>
      )}

      {addons.length === 0 && !adding ? (
        <div className="px-6 py-12 text-center text-sm text-smoke">
          Noch keine Zusatzprodukte. Leg das erste an.
        </div>
      ) : (
        <ul className="divide-y divide-stone/60">
          {addons.map((a) => (
            <li key={a.id} className="px-6 py-4">
              {editingId === a.id ? (
                <AddonForm
                  addon={a}
                  onClose={() => setEditingId(null)}
                />
              ) : (
                <AddonRowView addon={a} onEdit={() => { setEditingId(a.id); setAdding(false); }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddonRowView({ addon, onEdit }: { addon: AddonRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`„${addon.name}" wirklich löschen?\nWird bei Paketen und Shootings, die es enthalten, automatisch entfernt.`)) return;
    startTransition(async () => {
      try {
        await deleteAddon(addon.id);
        toast.success("Gelöscht");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht löschen");
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className="w-14 h-14 rounded-lg overflow-hidden border border-stone shrink-0 flex items-center justify-center bg-linen"
      >
        {addon.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={addon.imageUrl} alt={addon.name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={20} strokeWidth={1.25} className="text-smoke opacity-50" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium truncate">{addon.name}</div>
          {!addon.isActive && (
            <span className="badge" style={{ background: "var(--linen)", color: "var(--smoke)" }}>
              <EyeOff size={10} /> Inaktiv
            </span>
          )}
        </div>
        {addon.description && (
          <div className="text-xs text-smoke mt-0.5 line-clamp-1">{addon.description}</div>
        )}
      </div>
      <div className="text-right tabular-nums font-medium shrink-0">{formatEUR(addon.price)}</div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="btn-icon" disabled={pending} title="Bearbeiten">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="btn-icon" disabled={pending} style={{ color: "var(--accent)" }} title="Löschen">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function AddonForm({ addon, onClose }: { addon?: AddonRow; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(addon?.imageUrl ?? null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [pending, startTransition] = useTransition();

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPickedFile(f);
    setRemoveImage(false);
    setPreview(URL.createObjectURL(f));
  }

  function onClearImage() {
    setPickedFile(null);
    setPreview(null);
    setRemoveImage(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (removeImage) fd.set("removeImage", "1");
    if (pickedFile) fd.set("image", pickedFile);

    startTransition(async () => {
      try {
        if (addon) await updateAddon(addon.id, fd);
        else await createAddon(fd);
        toast.success(addon ? "Aktualisiert" : "Angelegt");
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
        <Field label="Name *">
          <input name="name" defaultValue={addon?.name ?? ""} required className="input h-9 text-sm" placeholder="z.B. Bilderbuch M" />
        </Field>
        <Field label="Preis (€) *">
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={addon?.price ?? ""}
            required
            className="input h-9 text-sm"
          />
        </Field>
      </FormRow>

      <Field label="Beschreibung" hint="optional, wird der Kundin gezeigt">
        <textarea
          name="description"
          defaultValue={addon?.description ?? ""}
          rows={2}
          className="textarea text-sm"
          placeholder="z.B. 20 Seiten, Premium-Papier, in Geschenkbox"
        />
      </Field>

      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-lg overflow-hidden border border-stone shrink-0 flex items-center justify-center bg-paper"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vorschau" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={24} strokeWidth={1.25} className="text-smoke opacity-50" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-secondary text-xs h-9"
          >
            <Upload size={12} /> Bild wählen
          </button>
          {preview && (
            <button
              type="button"
              onClick={onClearImage}
              className="btn-ghost text-xs h-9"
              style={{ color: "var(--accent)" }}
            >
              <X size={12} /> Entfernen
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-smoke ml-auto cursor-pointer">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={addon?.isActive ?? true}
            className="w-3.5 h-3.5"
          />
          Aktiv (zur Auswahl in Paketen/Shootings)
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onClose} disabled={pending} className="btn-ghost text-sm">
          Abbrechen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={12} /> {pending ? "Speichern…" : addon ? "Aktualisieren" : "Anlegen"}
        </button>
      </div>
    </form>
  );
}
