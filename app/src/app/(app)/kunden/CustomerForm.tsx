"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Field, FormRow } from "@/components/form/Field";
import { Upload, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Status = { id: string; label: string; color: string };
type Tag = { id: string; label: string; color: string };

export type CustomerInitial = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  birthday?: Date | string | null;
  avatarUrl?: string | null;
  billingStreet?: string | null;
  billingZip?: string | null;
  billingCity?: string | null;
  billingCountry?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  website?: string | null;
  statusId?: string | null;
  source?: string | null;
  internalNotes?: string | null;
  tagIds?: string[];
};

type Props = {
  initial?: CustomerInitial;
  statuses: Status[];
  tags: Tag[];
  action: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
};

function toInputDate(d?: Date | string | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function CustomerForm({ initial, statuses, tags, action, deleteAction }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initial?.avatarUrl ?? null);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.tagIds ?? []);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    selectedTags.forEach((id) => fd.append("tagIds", id));
    try {
      await action(fd);
      toast.success(initial?.id ? "Änderungen gespeichert" : "Kundin angelegt");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!deleteAction) return;
    if (!confirm("Diese Kundin wirklich löschen? Alle Shootings und Notizen gehen verloren.")) return;
    setSubmitting(true);
    try {
      await deleteAction();
    } catch (e) {
      toast.error("Konnte nicht gelöscht werden.");
      setSubmitting(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Profilbild & Identität */}
      <section className="card p-6">
        <div className="eyebrow mb-4 eyebrow-muted">Profil</div>
        <div className="flex gap-6 items-start">
          <div className="shrink-0">
            <div className="relative">
              {preview ? (
                <img src={preview} alt="" className="w-28 h-28 rounded-full object-cover border border-stone" />
              ) : (
                <Avatar firstName={initial?.firstName} lastName={initial?.lastName} size={112} />
              )}
            </div>
            <input ref={fileInput} type="file" name="avatar" accept="image/*" className="hidden" onChange={onFile} />
            <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary mt-3 w-full text-xs">
              <Upload size={14} /> Bild
            </button>
          </div>

          <div className="flex-1 space-y-4">
            <FormRow>
              <Field label="Vorname *">
                <input name="firstName" defaultValue={initial?.firstName} className="input" required />
              </Field>
              <Field label="Nachname *">
                <input name="lastName" defaultValue={initial?.lastName} className="input" required />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="E-Mail">
                <input type="email" name="email" defaultValue={initial?.email ?? ""} className="input" />
              </Field>
              <Field label="Telefon">
                <input name="phone" defaultValue={initial?.phone ?? ""} className="input" />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Geburtstag" hint="Für die Reaktivierung — du wirst rechtzeitig erinnert.">
                <input type="date" name="birthday" defaultValue={toInputDate(initial?.birthday)} className="input" />
              </Field>
              <Field label="Wie hat sie/er von dir erfahren?">
                <input name="source" defaultValue={initial?.source ?? ""} placeholder="z.B. Instagram, Empfehlung von …" className="input" />
              </Field>
            </FormRow>
          </div>
        </div>
      </section>

      {/* Status + Tags */}
      <section className="card p-6">
        <div className="eyebrow mb-4 eyebrow-muted">Einordnung</div>
        <FormRow>
          <Field label="Status">
            <select name="statusId" defaultValue={initial?.statusId ?? ""} className="select">
              <option value="">— kein Status —</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const active = selectedTags.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    className="badge transition"
                    style={{
                      background: active ? t.color : `${t.color}12`,
                      color: active ? "#fff" : t.color,
                      cursor: "pointer",
                      border: active ? "none" : `1px solid ${t.color}30`,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
              {tags.length === 0 && (
                <div className="text-xs text-smoke">Lege Tags in den Einstellungen an.</div>
              )}
            </div>
          </Field>
        </FormRow>
      </section>

      {/* Rechnungsadresse */}
      <section className="card p-6">
        <div className="eyebrow mb-4 eyebrow-muted">Rechnungsadresse</div>
        <Field label="Straße & Hausnummer" className="mb-4">
          <input name="billingStreet" defaultValue={initial?.billingStreet ?? ""} className="input" />
        </Field>
        <FormRow>
          <Field label="PLZ"><input name="billingZip" defaultValue={initial?.billingZip ?? ""} className="input" /></Field>
          <Field label="Stadt"><input name="billingCity" defaultValue={initial?.billingCity ?? ""} className="input" /></Field>
        </FormRow>
        <Field label="Land" className="mt-4">
          <input name="billingCountry" defaultValue={initial?.billingCountry ?? "Deutschland"} className="input" />
        </Field>
      </section>

      {/* Social */}
      <section className="card p-6">
        <div className="eyebrow mb-4 eyebrow-muted">Social</div>
        <FormRow>
          <Field label="Instagram"><input name="instagram" defaultValue={initial?.instagram ?? ""} placeholder="@username" className="input" /></Field>
          <Field label="Facebook"><input name="facebook" defaultValue={initial?.facebook ?? ""} className="input" /></Field>
        </FormRow>
        <FormRow>
          <Field label="TikTok" className="mt-4"><input name="tiktok" defaultValue={initial?.tiktok ?? ""} className="input" /></Field>
          <Field label="Website" className="mt-4"><input name="website" defaultValue={initial?.website ?? ""} className="input" /></Field>
        </FormRow>
      </section>

      {/* Notizen */}
      <section className="card p-6">
        <div className="eyebrow mb-4 eyebrow-muted">Interne Notizen</div>
        <Field hint="Sieht nur du. Vorlieben, Outfit-Wünsche, Hinweise zum Briefing …">
          <textarea name="internalNotes" defaultValue={initial?.internalNotes ?? ""} className="textarea" rows={5} />
        </Field>
      </section>

      {/* Actions */}
      <div className="flex justify-between items-center sticky bottom-4 z-10">
        <div>
          {deleteAction && (
            <button type="button" onClick={onDelete} className="btn-ghost" style={{ color: "rgb(var(--accent))" }}>
              <Trash2 size={16} /> Löschen
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.back()} className="btn-secondary">Abbrechen</button>
          <button type="submit" disabled={submitting} className="btn-accent">
            {submitting ? "Speichere…" : initial?.id ? "Speichern" : "Anlegen"}
          </button>
        </div>
      </div>
    </form>
  );
}
