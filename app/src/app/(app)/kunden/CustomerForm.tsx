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
  welcomeStreet?: string | null;
  welcomeZip?: string | null;
  welcomeCity?: string | null;
  welcomeCountry?: string | null;
  welcomeNote?: string | null;
  deliveryStreet?: string | null;
  deliveryZip?: string | null;
  deliveryCity?: string | null;
  deliveryCountry?: string | null;
  deliveryNote?: string | null;
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

      {/* Lieferadressen: Welcome-Package + Fotoprodukte. Beide optional, beide
          mit Toggle „wie Rechnungsadresse" für den Standardfall (Felder leer). */}
      <DeliveryAddressSection
        label="Welcome-Package"
        hint="Wenn Lisa eine kleine Überraschung schickt — z.B. an Tante, Freundin, Nachbarin."
        namePrefix="welcome"
        initial={{
          street: initial?.welcomeStreet ?? null,
          zip: initial?.welcomeZip ?? null,
          city: initial?.welcomeCity ?? null,
          country: initial?.welcomeCountry ?? null,
          note: initial?.welcomeNote ?? null,
        }}
        notePlaceholder='z.B. „bitte klingeln bei Müller / Code 4231"…'
      />

      <DeliveryAddressSection
        label="Lieferadresse für Fotoprodukte"
        hint="Wohin werden Alben, Leinwände, Drucke geliefert? Packstation oder Sonderadresse hier hinterlegen."
        namePrefix="delivery"
        initial={{
          street: initial?.deliveryStreet ?? null,
          zip: initial?.deliveryZip ?? null,
          city: initial?.deliveryCity ?? null,
          country: initial?.deliveryCountry ?? null,
          note: initial?.deliveryNote ?? null,
        }}
        notePlaceholder='z.B. „Packstation 174, Kundennummer 12345" oder „Bitte beim Nachbarn abgeben"…'
      />

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

/**
 * Collapsible Lieferadressen-Sektion mit „wie Rechnungsadresse"-Toggle.
 * Wenn der Toggle aktiv ist (Default für leere Adressen), wird die DB null
 * gespeichert — beim Versand fällt der Code auf die Rechnungsadresse zurück.
 *
 * UI-Pattern: Card mit Checkbox oben. Felder sind versteckt wenn Checkbox=on
 * und keine Werte vorhanden sind. Sobald User Felder ausfüllt, bleiben sie
 * sichtbar.
 *
 * Inputs werden bewusst kontrolliert gerendert, damit ein „leeren"-Click
 * (Checkbox an → off) die Werte korrekt clearen kann.
 */
function DeliveryAddressSection({
  label,
  hint,
  namePrefix,
  initial,
  notePlaceholder,
}: {
  label: string;
  hint: string;
  namePrefix: "welcome" | "delivery";
  initial: {
    street: string | null;
    zip: string | null;
    city: string | null;
    country: string | null;
    note: string | null;
  };
  notePlaceholder: string;
}) {
  const hasInitial = !!(initial.street || initial.zip || initial.city || initial.country || initial.note);
  const [useBilling, setUseBilling] = useState<boolean>(!hasInitial);
  const [street, setStreet] = useState(initial.street ?? "");
  const [zip, setZip] = useState(initial.zip ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [note, setNote] = useState(initial.note ?? "");

  // Wenn „wie Rechnungsadresse" aktiv ist, schicken wir leere Strings — die Action
  // mapped sie auf null. Sonst die echten Werte.
  const emit = (v: string) => (useBilling ? "" : v);

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="eyebrow eyebrow-muted">{label}</div>
          <div className="text-xs text-smoke mt-1 max-w-xl">{hint}</div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={useBilling}
            onChange={(e) => setUseBilling(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          <span>Wie Rechnungsadresse</span>
        </label>
      </div>

      {!useBilling && (
        <>
          <Field label="Straße & Hausnummer" className="mb-3">
            <input value={street} onChange={(e) => setStreet(e.target.value)} className="input" />
          </Field>
          <FormRow>
            <Field label="PLZ">
              <input value={zip} onChange={(e) => setZip(e.target.value)} className="input" />
            </Field>
            <Field label="Stadt">
              <input value={city} onChange={(e) => setCity(e.target.value)} className="input" />
            </Field>
          </FormRow>
          <Field label="Land" className="mt-3">
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Deutschland" className="input" />
          </Field>
          <Field label="Notiz" hint="Optional — Hinweise für den Boten." className="mt-3">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} className="input" />
          </Field>
        </>
      )}

      <input type="hidden" name={`${namePrefix}Street`} value={emit(street)} />
      <input type="hidden" name={`${namePrefix}Zip`} value={emit(zip)} />
      <input type="hidden" name={`${namePrefix}City`} value={emit(city)} />
      <input type="hidden" name={`${namePrefix}Country`} value={emit(country)} />
      <input type="hidden" name={`${namePrefix}Note`} value={emit(note)} />
    </section>
  );
}
