"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Field, FormRow } from "@/components/form/Field";
import { Upload, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

type Expertise = { id: string; label: string; color: string };

export type TeamInitial = {
  id?: string;
  firstName?: string;
  lastName?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  website?: string | null;
  isOwner?: boolean;
  expertiseIds?: string[];
};

type Props = {
  initial?: TeamInitial;
  expertise: Expertise[];
  action: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
};

export function TeamForm({ initial, expertise, action, deleteAction }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initial?.avatarUrl ?? null);
  const [selected, setSelected] = useState<string[]>(initial?.expertiseIds ?? []);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    selected.forEach((id) => fd.append("expertiseIds", id));
    try {
      await action(fd);
      toast.success(initial?.id ? "Gespeichert" : "Mitglied angelegt");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAction || initial?.isOwner) return;
    if (!confirm("Mitglied wirklich entfernen?")) return;
    setBusy(true);
    try { await deleteAction(); } catch (err: any) { toast.error(err?.message ?? "Fehler"); setBusy(false); }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPreview(URL.createObjectURL(f));
  }

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4 flex items-center gap-2">
          Profil
          {initial?.isOwner && (
            <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
              <Star size={11} /> Eigenes Profil
            </span>
          )}
        </div>
        <div className="flex gap-6 items-start">
          <div className="shrink-0">
            {preview ? (
              <img src={preview} alt="" className="w-28 h-28 rounded-full object-cover border border-stone" />
            ) : (
              <Avatar firstName={initial?.firstName} lastName={initial?.lastName} size={112} />
            )}
            <input ref={fileInput} type="file" name="avatar" accept="image/*" className="hidden" onChange={onFile} />
            <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary mt-3 w-full text-xs">
              <Upload size={14} /> Bild
            </button>
          </div>
          <div className="flex-1 space-y-4">
            <FormRow>
              <Field label="Vorname *"><input name="firstName" defaultValue={initial?.firstName} className="input" required /></Field>
              <Field label="Nachname *"><input name="lastName" defaultValue={initial?.lastName} className="input" required /></Field>
            </FormRow>
            <Field label="Rolle im Team" hint="z.B. Inhaberin · Second Shooter · Make-up · Assistenz">
              <input name="role" defaultValue={initial?.role ?? ""} placeholder="Inhaberin" className="input" />
            </Field>
            <Field label="Biografie" hint="Erscheint auf der Kundenansicht — kurz, warm, persönlich.">
              <textarea name="bio" defaultValue={initial?.bio ?? ""} rows={4} className="textarea" />
            </Field>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4">Ansprechpartner für</div>
        <div className="flex flex-wrap gap-1.5">
          {expertise.map((e) => {
            const active = selected.includes(e.id);
            return (
              <button
                type="button"
                key={e.id}
                onClick={() => toggle(e.id)}
                className="badge"
                style={{
                  background: active ? e.color : `${e.color}15`,
                  color: active ? "#fff" : e.color,
                  cursor: "pointer",
                  border: active ? "none" : `1px solid ${e.color}30`,
                }}
              >
                {e.label}
              </button>
            );
          })}
          {expertise.length === 0 && (
            <div className="text-xs text-smoke">Lege Schwerpunkte in den Einstellungen an.</div>
          )}
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Kontakt</div>
        <FormRow>
          <Field label="E-Mail"><input type="email" name="email" defaultValue={initial?.email ?? ""} className="input" /></Field>
          <Field label="Telefon"><input name="phone" defaultValue={initial?.phone ?? ""} className="input" /></Field>
        </FormRow>
      </section>

      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Social</div>
        <FormRow>
          <Field label="Instagram"><input name="instagram" defaultValue={initial?.instagram ?? ""} placeholder="@username" className="input" /></Field>
          <Field label="Facebook"><input name="facebook" defaultValue={initial?.facebook ?? ""} className="input" /></Field>
        </FormRow>
        <FormRow>
          <Field label="TikTok"><input name="tiktok" defaultValue={initial?.tiktok ?? ""} className="input" /></Field>
          <Field label="Website"><input name="website" defaultValue={initial?.website ?? ""} placeholder="https://" className="input" /></Field>
        </FormRow>
      </section>

      <div className="flex justify-between items-center">
        <div>
          {deleteAction && !initial?.isOwner && (
            <button type="button" onClick={onDelete} className="btn-ghost" style={{ color: "var(--accent)" }}>
              <Trash2 size={16} /> Mitglied entfernen
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
