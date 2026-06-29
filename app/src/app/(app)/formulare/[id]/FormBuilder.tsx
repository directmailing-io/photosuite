"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save, Trash2, Plus, X, Settings, Palette, ListChecks, Eye, Code,
  ChevronUp, ChevronDown, Pause, Zap, ExternalLink, Copy, Type, Mail,
  Phone, AlignLeft, ListTodo, CalendarDays, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import {
  updateLeadFormMeta, updateLeadFormDesign, toggleLeadFormActive, deleteLeadForm,
  addLeadFormField, updateLeadFormField, deleteLeadFormField, moveLeadFormField,
} from "../actions";

type FieldRow = {
  id: string;
  type: string;
  systemKey: string | null;
  label: string;
  helpText: string | null;
  placeholder: string | null;
  required: boolean;
  options: string | null;
  position: number;
};

type Props = {
  form: {
    id: string;
    slug: string;
    name: string;
    headline: string | null;
    intro: string | null;
    buttonText: string;
    successMessage: string | null;
    isActive: boolean;
    accentColor: string;
    fontStyle: string;
    background: string;
    fields: FieldRow[];
  };
};

type Tab = "meta" | "fields" | "design" | "preview" | "embed";

const FIELD_TYPE_META: Record<string, { label: string; Icon: typeof Type }> = {
  text: { label: "Text", Icon: Type },
  textarea: { label: "Textfeld (mehrzeilig)", Icon: AlignLeft },
  email: { label: "E-Mail", Icon: Mail },
  phone: { label: "Telefon", Icon: Phone },
  select: { label: "Auswahl", Icon: ListTodo },
  date: { label: "Datum", Icon: CalendarDays },
  consent: { label: "DSGVO-Zustimmung", Icon: ShieldCheck },
};

export function FormBuilder({ form }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("fields");
  const [busy, setBusy] = useState(false);

  async function onToggleActive() {
    setBusy(true);
    try {
      await toggleLeadFormActive(form.id, !form.isActive);
      toast.success(form.isActive ? "Pausiert" : "Aktiviert");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function onDelete() {
    if (!confirm(`Formular „${form.name}" löschen?\nBereits eingegangene Anfragen (Leads) bleiben erhalten — nur die Verknüpfung wird entfernt.`)) return;
    setBusy(true);
    try {
      await deleteLeadForm(form.id);
      toast.success("Gelöscht");
      router.push("/formulare");
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
      setBusy(false);
    }
  }

  function copyText(text: string, label = "Kopiert") {
    navigator.clipboard.writeText(text);
    toast.success(label);
  }

  const publicUrl = typeof window !== "undefined"
    ? `${window.location.origin}/anfrage/${form.slug}`
    : `/anfrage/${form.slug}`;
  const embedUrl = typeof window !== "undefined"
    ? `${window.location.origin}/embed/${form.id}`
    : `/embed/${form.id}`;
  const embedSnippet = typeof window !== "undefined"
    ? `<div data-photosuite-form="${form.id}"></div>\n<script src="${window.location.origin}/api/embed.js" async></script>`
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TabBar tab={tab} setTab={setTab} />
        <div className="flex items-center gap-2">
          <button onClick={onToggleActive} disabled={busy} className="btn-secondary text-xs h-8">
            {form.isActive ? <><Pause size={12} /> Pausieren</> : <><Zap size={12} /> Aktivieren</>}
          </button>
          <a href={publicUrl} target="_blank" rel="noopener" className="btn-secondary text-xs h-8">
            <ExternalLink size={12} /> Öffnen
          </a>
        </div>
      </div>

      {tab === "meta" && <MetaTab form={form} onDelete={onDelete} busy={busy} />}
      {tab === "fields" && <FieldsTab form={form} />}
      {tab === "design" && <DesignTab form={form} />}
      {tab === "preview" && <PreviewTab embedUrl={embedUrl} />}
      {tab === "embed" && (
        <EmbedTab
          publicUrl={publicUrl}
          embedUrl={embedUrl}
          embedSnippet={embedSnippet}
          onCopy={copyText}
        />
      )}
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: Array<{ key: Tab; label: string; Icon: typeof Settings }> = [
    { key: "fields",  label: "Felder",     Icon: ListChecks },
    { key: "meta",    label: "Allgemein",  Icon: Settings },
    { key: "design",  label: "Design",     Icon: Palette },
    { key: "preview", label: "Vorschau",   Icon: Eye },
    { key: "embed",   label: "Einbetten",  Icon: Code },
  ];
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition ${
            tab === key
              ? "bg-ink text-paper border-ink"
              : "border-stone bg-paper hover:bg-linen text-ink"
          }`}
        >
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>
  );
}

function MetaTab({ form, onDelete, busy }: { form: Props["form"]; onDelete: () => void; busy: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateLeadFormMeta(form.id, fd);
        toast.success("Gespeichert");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }
  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-4">
      <FormRow>
        <Field label="Name (intern) *">
          <input name="name" defaultValue={form.name} required maxLength={200} className="input" />
        </Field>
        <Field label="Slug *" hint='URL-Teil — z.B. „boudoir-anfrage". Nur a-z, 0-9, -.'>
          <input name="slug" defaultValue={form.slug} required maxLength={40} className="input font-mono" />
        </Field>
      </FormRow>
      <Field label="Headline (öffentlich)" hint="Erscheint groß über dem Formular. Leer = Name verwenden.">
        <input name="headline" defaultValue={form.headline ?? ""} maxLength={200} className="input" />
      </Field>
      <Field label="Einleitung" hint="Kurzer Beschreibungstext über den Feldern.">
        <textarea name="intro" defaultValue={form.intro ?? ""} rows={3} className="textarea text-sm" />
      </Field>
      <FormRow>
        <Field label="Button-Text">
          <input name="buttonText" defaultValue={form.buttonText} maxLength={50} className="input" />
        </Field>
      </FormRow>
      <Field label="Erfolgs-Meldung" hint="Wird nach erfolgreichem Absenden anstelle des Formulars angezeigt.">
        <textarea name="successMessage" defaultValue={form.successMessage ?? ""} rows={2} className="textarea text-sm" />
      </Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onDelete} disabled={busy} className="btn-ghost text-sm" style={{ color: "rgb(var(--accent))" }}>
          <Trash2 size={13} /> Formular löschen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={13} /> Speichern
        </button>
      </div>
    </form>
  );
}

function FieldsTab({ form }: { form: Props["form"] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <section className="card">
      <div className="px-5 py-4 border-b border-stone/60 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow eyebrow-muted">Felder ({form.fields.length})</div>
          <p className="text-xs text-smoke mt-1">
            Reihenfolge via Pfeil-Buttons. System-Felder (Name, Email, Telefon, Nachricht)
            werden direkt in die Kundenkartei übernommen, eigene Felder als Zusatz-Antwort.
          </p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setEditingId(null); }} className="btn-primary text-xs h-9">
            <Plus size={12} /> Feld hinzufügen
          </button>
        )}
      </div>
      {adding && (
        <div className="px-5 py-4 bg-linen/40 border-b border-stone/60">
          <FieldForm
            formId={form.id}
            existingSystemKeys={form.fields.map((f) => f.systemKey).filter(Boolean) as string[]}
            onCancel={() => setAdding(false)}
            onSaved={() => setAdding(false)}
          />
        </div>
      )}
      {form.fields.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-smoke italic">
          Noch keine Felder.
        </div>
      ) : (
        <ul>
          {form.fields.map((field, idx) => (
            <li key={field.id}>
              {editingId === field.id ? (
                <div className="px-5 py-4 bg-linen/40 border-t border-stone/60">
                  <FieldForm
                    formId={form.id}
                    field={field}
                    existingSystemKeys={form.fields.filter((f) => f.id !== field.id).map((f) => f.systemKey).filter(Boolean) as string[]}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <FieldRowView
                  field={field}
                  isFirst={idx === 0}
                  isLast={idx === form.fields.length - 1}
                  onEdit={() => { setEditingId(field.id); setAdding(false); }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FieldRowView({
  field, isFirst, isLast, onEdit,
}: {
  field: FieldRow;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const meta = FIELD_TYPE_META[field.type] ?? FIELD_TYPE_META.text;
  const Icon = meta.Icon;

  function onMove(delta: -1 | 1) {
    startTransition(async () => {
      await moveLeadFormField(field.id, delta);
      router.refresh();
    });
  }
  function onDelete() {
    if (!confirm(`Feld „${field.label}" löschen?`)) return;
    startTransition(async () => {
      try {
        await deleteLeadFormField(field.id);
        toast.success("Feld gelöscht");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <div className="px-5 py-3 flex items-center gap-3 border-t border-stone/60 first:border-0">
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={() => onMove(-1)} disabled={pending || isFirst} className="btn-icon" title="Nach oben">
          <ChevronUp size={12} />
        </button>
        <button onClick={() => onMove(1)} disabled={pending || isLast} className="btn-icon" title="Nach unten">
          <ChevronDown size={12} />
        </button>
      </div>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgb(var(--linen))" }}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-sm">{field.label}</div>
          {field.required && (
            <span className="badge" style={{ background: "rgb(var(--accent-soft))", color: "rgb(var(--accent-deep))" }}>Pflicht</span>
          )}
          {field.systemKey && (
            <span className="badge" style={{ background: "rgb(var(--linen))", color: "rgb(var(--smoke))" }}>
              System: {field.systemKey}
            </span>
          )}
        </div>
        <div className="text-xs text-smoke mt-0.5">
          {meta.label}
          {field.helpText && ` · „${field.helpText}"`}
        </div>
      </div>
      <button onClick={onEdit} className="btn-icon shrink-0" title="Bearbeiten">
        <Settings size={13} />
      </button>
      <button onClick={onDelete} disabled={pending} className="btn-icon shrink-0" style={{ color: "rgb(var(--accent))" }} title="Löschen">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function FieldForm({
  formId, field, existingSystemKeys, onCancel, onSaved,
}: {
  formId: string;
  field?: FieldRow;
  existingSystemKeys: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState(field?.type ?? "text");
  const [systemKey, setSystemKey] = useState(field?.systemKey ?? "");
  const isSelect = type === "select";
  const isConsent = type === "consent";
  const optionsText = field?.options
    ? (JSON.parse(field.options) as string[]).join("\n")
    : "";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        if (field) await updateLeadFormField(field.id, fd);
        else await addLeadFormField(formId, fd);
        toast.success(field ? "Aktualisiert" : "Hinzugefügt");
        router.refresh();
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  const systemKeyOptions = [
    { value: "", label: "— Kein System-Mapping" },
    { value: "firstName", label: "Vorname" },
    { value: "lastName", label: "Nachname" },
    { value: "email", label: "E-Mail" },
    { value: "phone", label: "Telefon" },
    { value: "message", label: "Nachricht" },
  ].filter((o) => !o.value || o.value === field?.systemKey || !existingSystemKeys.includes(o.value));

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormRow>
        <Field label="Feld-Typ *">
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={!!field}
            className="select"
          >
            {Object.entries(FIELD_TYPE_META).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>
        </Field>
        {!isConsent && (
          <Field label="System-Mapping" hint="Wenn gesetzt: Wert geht direkt in die Kundenkartei.">
            <select
              name="systemKey"
              value={systemKey}
              onChange={(e) => setSystemKey(e.target.value)}
              disabled={!!field}
              className="select"
            >
              {systemKeyOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        )}
      </FormRow>
      <Field label="Label (sichtbar) *">
        <input name="label" defaultValue={field?.label ?? ""} required maxLength={200} className="input" />
      </Field>
      <FormRow>
        <Field label="Hilfetext">
          <input name="helpText" defaultValue={field?.helpText ?? ""} maxLength={500} className="input" />
        </Field>
        {!isConsent && (
          <Field label="Platzhalter">
            <input name="placeholder" defaultValue={field?.placeholder ?? ""} maxLength={200} className="input" />
          </Field>
        )}
      </FormRow>
      {isSelect && (
        <Field label="Optionen" hint="Eine Option pro Zeile (oder durch Komma getrennt).">
          <textarea
            name="options"
            defaultValue={optionsText}
            rows={4}
            className="textarea text-sm font-mono"
            placeholder="Boudoir-Shooting&#10;Pärchen-Shooting&#10;Hochzeit"
          />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" defaultChecked={field?.required ?? false} className="w-4 h-4" />
        <span>Pflichtfeld</span>
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost text-sm">
          <X size={13} /> Abbrechen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={13} /> {field ? "Speichern" : "Hinzufügen"}
        </button>
      </div>
    </form>
  );
}

function DesignTab({ form }: { form: Props["form"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accent, setAccent] = useState(form.accentColor);
  const [font, setFont] = useState(form.fontStyle);
  const [bg, setBg] = useState(form.background);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateLeadFormDesign(form.id, fd);
        toast.success("Design gespeichert");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-5">
      <Field label="Akzentfarbe" hint="Für Buttons, Fokus-Rahmen, Akzente.">
        <div className="flex items-center gap-3">
          <input
            type="color"
            name="accentColor"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="h-10 w-16 rounded border border-stone cursor-pointer"
          />
          <input
            type="text"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="input font-mono w-32"
            maxLength={7}
          />
        </div>
      </Field>
      <Field label="Schrift-Stil">
        <div className="flex gap-2">
          {[
            { key: "sans", label: "Sans-Serif (modern)", preview: "system-ui, sans-serif" },
            { key: "serif", label: "Serif (klassisch)", preview: "Georgia, serif" },
          ].map((opt) => (
            <label
              key={opt.key}
              className="flex-1 cursor-pointer rounded-lg border p-3 transition"
              style={{
                background: font === opt.key ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
                borderColor: font === opt.key ? "rgb(var(--accent))" : "rgb(var(--stone))",
                borderWidth: font === opt.key ? 2 : 1,
              }}
            >
              <input
                type="radio"
                name="fontStyle"
                value={opt.key}
                checked={font === opt.key}
                onChange={() => setFont(opt.key)}
                className="sr-only"
              />
              <div className="text-base" style={{ fontFamily: opt.preview, fontWeight: 600 }}>Anfrage</div>
              <div className="text-xs text-smoke mt-1">{opt.label}</div>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Hintergrund">
        <div className="flex gap-2">
          {[
            { key: "paper", label: "Weiß", swatch: "#FBFAF7" },
            { key: "linen", label: "Creme", swatch: "#F3EFEC" },
            { key: "transparent", label: "Transparent", swatch: "transparent" },
          ].map((opt) => (
            <label
              key={opt.key}
              className="flex-1 cursor-pointer rounded-lg border p-3 transition flex items-center gap-2"
              style={{
                background: bg === opt.key ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
                borderColor: bg === opt.key ? "rgb(var(--accent))" : "rgb(var(--stone))",
                borderWidth: bg === opt.key ? 2 : 1,
              }}
            >
              <input
                type="radio"
                name="background"
                value={opt.key}
                checked={bg === opt.key}
                onChange={() => setBg(opt.key)}
                className="sr-only"
              />
              <div
                className="w-6 h-6 rounded border"
                style={{ background: opt.swatch === "transparent" ? "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 8px 8px" : opt.swatch, borderColor: "rgb(var(--stone))" }}
              />
              <span className="text-xs">{opt.label}</span>
            </label>
          ))}
        </div>
      </Field>
      <div className="flex justify-end pt-2 border-t border-stone/60">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={13} /> Design speichern
        </button>
      </div>
    </form>
  );
}

function PreviewTab({ embedUrl }: { embedUrl: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-smoke mb-2 px-2">
        Live-Vorschau (gleiche Render-Variante wie beim Einbetten):
      </div>
      <iframe
        src={embedUrl}
        className="w-full rounded-lg border border-stone"
        style={{ minHeight: 600, background: "#F8F7F4" }}
        title="Formular-Vorschau"
      />
    </div>
  );
}

function EmbedTab({
  publicUrl, embedUrl, embedSnippet, onCopy,
}: {
  publicUrl: string;
  embedUrl: string;
  embedSnippet: string;
  onCopy: (text: string, label?: string) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="eyebrow eyebrow-muted mb-3">Öffentliche URL</div>
        <p className="text-xs text-smoke mb-3">
          Direkt-Link zum Formular auf Photosuite. Teile ihn z.B. via Instagram-Bio, E-Mail-Signatur.
        </p>
        <div className="rounded-lg border border-stone bg-linen/40 p-2.5 text-xs font-mono break-all select-all mb-2">
          {publicUrl}
        </div>
        <button onClick={() => onCopy(publicUrl, "Link kopiert")} className="btn-secondary text-xs h-8">
          <Copy size={12} /> Kopieren
        </button>
      </section>

      <section className="card p-5">
        <div className="eyebrow eyebrow-muted mb-3">Einbetten auf eigener Website</div>
        <p className="text-xs text-smoke mb-3">
          Kopiere das Snippet und füge es an der Stelle deiner Website ein, an der das Formular erscheinen soll.
          Das Skript erzeugt automatisch einen iframe und passt die Höhe dynamisch an.
        </p>
        <div className="rounded-lg border border-stone bg-linen/40 p-3 text-xs font-mono whitespace-pre overflow-x-auto select-all mb-2">
          {embedSnippet}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => onCopy(embedSnippet, "Snippet kopiert")} className="btn-primary text-xs h-8">
            <Copy size={12} /> Snippet kopieren
          </button>
          <a href={embedUrl} target="_blank" rel="noopener" className="btn-secondary text-xs h-8">
            <ExternalLink size={12} /> Standalone-Vorschau
          </a>
        </div>
      </section>

      <section className="card p-5 text-xs text-smoke">
        <strong className="text-ink block mb-1">So funktioniert's:</strong>
        Das Snippet lädt asynchron unser Loader-Skript. Das Skript sucht den
        <code className="px-1">data-photosuite-form</code>-Container, fügt einen iframe ein und
        synchronisiert die Höhe per <code className="px-1">postMessage</code>. Damit gibt es
        keine Scrollbars und das Formular wirkt nahtlos eingebettet — auch wenn deine Website
        auf einer anderen Domain läuft.
      </section>
    </div>
  );
}
