"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Field, FormRow } from "@/components/form/Field";
import { TeamPicker, type TeamPickerMember } from "@/components/TeamPicker";
import { Upload, Trash2, Package as PackageIcon, UsersRound, FileQuestion, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type PackageInitial = {
  id?: string;
  name?: string;
  description?: string | null;
  coverUrl?: string | null;
  price?: number;
  depositAmount?: number | null;
  paymentTerms?: string | null;
  durationMin?: number | null;
  bookingBufferBeforeMin?: number | null;
  bookingBufferAfterMin?: number | null;
  isActive?: boolean;
  primaryContactId?: string | null;
  defaultTeamIds?: string[];
  defaultQuestionnaireIds?: string[];
  availableAddonIds?: string[];
};

type QuestionnaireOption = {
  id: string;
  title: string;
  fieldCount: number;
};

export type AddonOption = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

type Props = {
  initial?: PackageInitial;
  team: TeamPickerMember[];
  questionnaires: QuestionnaireOption[];
  addons?: AddonOption[];
  action: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
};

export function PackageForm({ initial, team, questionnaires, addons = [], action, deleteAction }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initial?.coverUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [selectedQ, setSelectedQ] = useState<string[]>(initial?.defaultQuestionnaireIds ?? []);
  const [selectedAddons, setSelectedAddons] = useState<string[]>(initial?.availableAddonIds ?? []);

  function toggleQ(id: string) {
    setSelectedQ((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleAddon(id: string) {
    setSelectedAddons((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      selectedAddons.forEach((id) => fd.append("availableAddonIds", id));
      await action(fd);
      toast.success(initial?.id ? "Gespeichert" : "Paket angelegt");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAction) return;
    if (!confirm("Paket wirklich löschen?")) return;
    setBusy(true);
    try { await deleteAction(); } catch { toast.error("Konnte nicht löschen"); setBusy(false); }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPreview(URL.createObjectURL(f));
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="card overflow-hidden">
          <div className="aspect-[16/10] bg-linen relative overflow-hidden">
            {preview ? (
              <img src={preview} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-taupe">
                <PackageIcon size={48} strokeWidth={1} />
              </div>
            )}
          </div>
          <div className="p-4">
            <input ref={fileInput} type="file" name="cover" accept="image/*" className="hidden" onChange={onFile} />
            <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary w-full">
              <Upload size={15} /> Cover-Bild hochladen
            </button>
            <div className="text-xs text-smoke mt-2 text-center">JPG, PNG, WebP — bestes Format: 16:10</div>
          </div>
        </div>

        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3 flex items-center gap-2"><UsersRound size={13} /> Standard-Team</div>
          <div className="text-xs text-smoke mb-3">
            Wer steht standardmäßig hinter der Kamera, wenn jemand dieses Paket bucht? Lässt sich pro Shooting überschreiben.
          </div>
          <TeamPicker
            members={team}
            initialPrimaryId={initial?.primaryContactId}
            initialMemberIds={initial?.defaultTeamIds}
          />
        </div>

        <div className="card p-5">
          <div className="eyebrow eyebrow-muted mb-3 flex items-center gap-2">
            <FileQuestion size={13} /> Standard-Fragebögen
          </div>
          <div className="text-xs text-smoke mb-3">
            Diese Vorlagen werden bei jedem neuen Shooting mit diesem Paket automatisch angelegt — als Entwurf, bevor du sie versendest.
          </div>
          {selectedQ.map((id) => (
            <input key={id} type="hidden" name="questionnaireIds" value={id} />
          ))}
          {questionnaires.length === 0 ? (
            <div className="text-sm text-smoke">
              Noch keine Vorlagen.{" "}
              <Link href="/fragebogen/vorlagen" className="underline hover:text-ink">
                Erste Vorlage anlegen
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {questionnaires.map((q) => {
                const active = selectedQ.includes(q.id);
                return (
                  <button
                    type="button"
                    key={q.id}
                    onClick={() => toggleQ(q.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition"
                    style={{
                      borderColor: active ? "rgb(var(--ink))" : "rgb(var(--stone))",
                      background: active ? "rgb(var(--paper))" : "transparent",
                    }}
                  >
                    <span
                      className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                      style={{
                        borderColor: active ? "rgb(var(--ink))" : "rgb(var(--stone))",
                        background: active ? "rgb(var(--ink))" : "transparent",
                      }}
                    >
                      {active && <Check size={12} className="text-bg" strokeWidth={3} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{q.title}</div>
                      <div className="text-xs text-smoke">{q.fieldCount} {q.fieldCount === 1 ? "Frage" : "Fragen"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-6">
        <section className="card p-6 space-y-4">
          <div className="eyebrow eyebrow-muted">Stammdaten</div>
          <Field label="Name *">
            <input name="name" defaultValue={initial?.name} className="input" required />
          </Field>
          <Field label="Beschreibung">
            <textarea name="description" defaultValue={initial?.description ?? ""} rows={4} className="textarea" placeholder="Was beinhaltet das Paket? Wie viele Bilder, Dauer, Extras …" />
          </Field>
        </section>

        <section className="card p-6 space-y-4">
          <div className="eyebrow eyebrow-muted">Preis & Zahlung</div>
          <FormRow>
            <Field label="Preis (€) *">
              <input name="price" type="number" step="0.01" min="0" defaultValue={initial?.price ?? ""} className="input" required />
            </Field>
            <Field label="Anzahlung (€)">
              <input name="depositAmount" type="number" step="0.01" min="0" defaultValue={initial?.depositAmount ?? ""} className="input" />
            </Field>
          </FormRow>
          <Field label="Zahlungsbedingungen">
            <textarea name="paymentTerms" defaultValue={initial?.paymentTerms ?? ""} rows={3} className="textarea" placeholder={`z.B. „50 % bei Buchung, Rest am Shootingtag"`} />
          </Field>
          <Field label="Termin-Dauer (Minuten)" hint="Wie lange blockiert das Paket den Kalender? Wird beim Slot-Finden geprüft (muss am Stück reinpassen).">
            <input name="durationMin" type="number" min="0" defaultValue={initial?.durationMin ?? ""} className="input" />
          </Field>
          <FormRow>
            <Field label="Puffer vorher (Min)" hint="Aufbau, Anreise">
              <input name="bookingBufferBeforeMin" type="number" min="0" defaultValue={initial?.bookingBufferBeforeMin ?? 0} className="input" />
            </Field>
            <Field label="Puffer nachher (Min)" hint="Abbau, Nachbereitung">
              <input name="bookingBufferAfterMin" type="number" min="0" defaultValue={initial?.bookingBufferAfterMin ?? 15} className="input" />
            </Field>
          </FormRow>
        </section>

        {addons.length > 0 && (
          <section className="card p-6">
            <div className="eyebrow eyebrow-muted mb-3">Verfügbare Zusatzprodukte</div>
            <div className="text-xs text-smoke mb-4">
              Welche Add-Ons sollen bei Buchung dieses Pakets zur Auswahl stehen?
              <span className="block mt-0.5">Neue Add-Ons legst du unter Einstellungen → Zusatzprodukte an.</span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {addons.map((a) => {
                const checked = selectedAddons.includes(a.id);
                return (
                  <li key={a.id}>
                    <label
                      className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition hover:bg-linen/50"
                      style={{
                        borderColor: checked ? "rgb(var(--ink))" : "rgb(var(--stone))",
                        background: checked ? "rgb(var(--linen))" : "rgb(var(--paper))",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAddon(a.id)}
                        className="w-4 h-4 shrink-0"
                      />
                      {a.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.imageUrl} alt={a.name} className="w-10 h-10 rounded object-cover shrink-0 border border-stone" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-linen shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        <div className="text-xs text-smoke tabular-nums">
                          {a.price.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="card p-6 flex items-center gap-3">
          <input id="isActive" type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="w-4 h-4" />
          <label htmlFor="isActive" className="text-sm">
            <span className="font-medium">Aktiv</span>
            <span className="text-smoke ml-2">— deaktivierte Pakete werden bei neuen Shootings ausgeblendet, bleiben aber für Reports erhalten.</span>
          </label>
        </section>

        <div className="flex justify-between items-center">
          <div>
            {deleteAction && (
              <button type="button" onClick={onDelete} className="btn-ghost" style={{ color: "rgb(var(--accent))" }}>
                <Trash2 size={16} /> Löschen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.back()} className="btn-secondary">Abbrechen</button>
            <button disabled={busy} className="btn-accent">{busy ? "Speichern…" : initial?.id ? "Speichern" : "Anlegen"}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
