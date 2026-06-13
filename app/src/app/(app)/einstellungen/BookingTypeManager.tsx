"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, FormRow } from "@/components/form/Field";
import {
  Plus, Trash2, Pencil, Save, X, Eye, EyeOff, Copy, CalendarCheck, Clock, ExternalLink,
  ChevronLeft, ChevronRight, Sparkles, Settings as SettingsIcon, Check, Phone, MessageSquare, Zap,
  MapPin, Video, Home, Code2, GripVertical, AlignLeft, Type as TypeIcon, Mail, ChevronDown,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { VIDEO_PROVIDER_ORDER, VIDEO_PROVIDERS, type VideoProviderKey } from "@/lib/videoProviders";
import { toast } from "sonner";
import { createBookingType, updateBookingType, deleteBookingType } from "./bookingTypeActions";

export type BookingTypeRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minLeadHours: number;
  maxAheadDays: number;
  slotIntervalMin: number;
  location: string | null;
  locationsJson: string | null;
  videoProvider: string | null;
  requiredFieldsJson: string | null;
  autoConfirm: boolean;
  requirePhone: boolean;
  requireMessage: boolean;
  color: string;
  isActive: boolean;
  position: number;
};

function formatEUR(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatDuration(min: number) {
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} Std` : `${h} Std ${m} Min`;
}

export function BookingTypeManager({
  types,
  appBaseUrl,
}: {
  types: BookingTypeRow[];
  appBaseUrl: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="px-6 py-4 flex items-center justify-between border-b border-stone/60">
        <div>
          <div className="eyebrow eyebrow-muted">Buchungslinks</div>
          <div className="text-sm text-smoke mt-1 max-w-md">
            Lege Termin-Typen an, die deine Kundinnen online buchen können — z.B. „Erstgespräch 30 Min kostenlos" oder „Vorgespräch Boudoir".
          </div>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="btn-primary text-xs h-9"
          >
            <Plus size={13} /> Neu
          </button>
        )}
      </div>

      {adding && (
        <div className="px-6 py-5 bg-linen/40 border-b border-stone/60">
          <BookingTypeForm onClose={() => setAdding(false)} />
        </div>
      )}

      {types.length === 0 && !adding ? (
        <div className="px-6 py-12 text-center text-sm text-smoke">
          Noch keine Buchungstypen. Lege deinen ersten an — z.B. „Erstgespräch 30 Min kostenlos".
        </div>
      ) : (
        <ul className="divide-y divide-stone/60">
          {types.map((t) => (
            <li key={t.id} className="px-6 py-4">
              {editingId === t.id ? (
                <BookingTypeForm
                  type={t}
                  onClose={() => setEditingId(null)}
                />
              ) : (
                <BookingTypeRowView
                  type={t}
                  appBaseUrl={appBaseUrl}
                  onEdit={() => { setEditingId(t.id); setAdding(false); }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingTypeRowView({
  type,
  appBaseUrl,
  onEdit,
}: {
  type: BookingTypeRow;
  appBaseUrl: string;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function buildLink(): string {
    const origin = appBaseUrl || (typeof window !== "undefined" ? window.location.origin : "");
    return `${origin}/b/${type.slug}`;
  }

  function onCopyLink() {
    const link = buildLink();
    if (!navigator?.clipboard) {
      toast.error("Zwischenablage nicht verfügbar");
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => toast.success("Link kopiert"),
      () => toast.error("Konnte Link nicht kopieren"),
    );
  }

  function onCopyEmbed() {
    const link = `${buildLink()}?embed=1`;
    const code = `<iframe src="${link}" width="100%" height="780" frameborder="0" style="border:0;max-width:680px;display:block;margin:0 auto;" loading="lazy"></iframe>`;
    if (!navigator?.clipboard) {
      toast.error("Zwischenablage nicht verfügbar");
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => toast.success("Einbettungs-Code kopiert"),
      () => toast.error("Konnte Code nicht kopieren"),
    );
  }

  function onOpenLink() {
    const link = buildLink();
    if (typeof window !== "undefined") window.open(link, "_blank", "noopener,noreferrer");
  }

  function onDelete() {
    if (!confirm(`„${type.name}" wirklich löschen?\nBereits eingegangene Buchungen? Dann wird der Typ stattdessen nur deaktiviert.`)) return;
    startTransition(async () => {
      try {
        await deleteBookingType(type.id);
        toast.success("Gelöscht");
        router.refresh();
      } catch (err: any) {
        const msg = err?.message ?? "Konnte nicht löschen";
        if (msg.includes("inaktiv")) {
          toast.success(msg);
          router.refresh();
        } else {
          toast.error(msg);
        }
      }
    });
  }

  function onToggleActive() {
    const fd = new FormData();
    fd.set("name", type.name);
    fd.set("description", type.description ?? "");
    fd.set("durationMin", String(type.durationMin));
    fd.set("bufferBeforeMin", String(type.bufferBeforeMin));
    fd.set("bufferAfterMin", String(type.bufferAfterMin));
    fd.set("minLeadHours", String(type.minLeadHours));
    fd.set("maxAheadDays", String(type.maxAheadDays));
    fd.set("slotIntervalMin", String(type.slotIntervalMin));
    fd.set("location", type.location ?? "");
    fd.set("color", type.color);
    if (type.autoConfirm) fd.set("autoConfirm", "on");
    if (type.requirePhone) fd.set("requirePhone", "on");
    if (type.requireMessage) fd.set("requireMessage", "on");
    if (!type.isActive) fd.set("isActive", "on");
    // Wenn aktuell aktiv → kein isActive setzen ⇒ wird deaktiviert.
    startTransition(async () => {
      try {
        await updateBookingType(type.id, fd);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht umschalten");
      }
    });
  }

  return (
    <div className="flex items-center gap-4" style={{ opacity: type.isActive ? 1 : 0.55 }}>
      <div
        className="w-3 h-3 rounded-full shrink-0 border border-stone/40"
        style={{ background: type.color }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium truncate font-serif text-base">{type.name}</div>
          {!type.isActive && (
            <span className="badge" style={{ background: "var(--linen)", color: "var(--smoke)" }}>
              <EyeOff size={10} /> Inaktiv
            </span>
          )}
          {type.autoConfirm && (
            <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--ink)" }}>
              Auto-Bestätigung
            </span>
          )}
        </div>
        <div className="text-xs text-smoke mt-1 flex items-center gap-2 flex-wrap tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} strokeWidth={1.5} /> {formatDuration(type.durationMin)}
          </span>
          <span className="opacity-40">·</span>
          <span className="truncate font-mono opacity-75">/b/{type.slug}</span>
        </div>
        {type.description && (
          <div className="text-xs text-smoke mt-1 line-clamp-1 opacity-80">{type.description}</div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onCopyLink}
          className="btn-icon"
          disabled={pending}
          title="Buchungslink kopieren"
        >
          <Copy size={13} />
        </button>
        <button
          onClick={onCopyEmbed}
          className="btn-icon"
          disabled={pending}
          title="Einbettungs-Code kopieren (iframe für deine Website)"
        >
          <Code2 size={13} />
        </button>
        <button
          onClick={onOpenLink}
          className="btn-icon"
          disabled={pending}
          title="Buchungsseite öffnen"
        >
          <ExternalLink size={13} />
        </button>
        <button
          onClick={onToggleActive}
          className="btn-icon"
          disabled={pending}
          title={type.isActive ? "Deaktivieren (nicht mehr buchbar)" : "Aktivieren"}
        >
          {type.isActive ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button onClick={onEdit} className="btn-icon" disabled={pending} title="Bearbeiten">
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="btn-icon"
          disabled={pending}
          style={{ color: "var(--accent)" }}
          title="Löschen"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 3-Step-Wizard für Anlegen/Bearbeiten eines Buchungstyps.
 * Step 1: Was bietest du an? (Name, Beschreibung, Dauer, Farbe)
 * Step 2: Wann ist es buchbar? (Slot-Raster, Puffer, Vorlauf, Horizont)
 * Step 3: Buchungs-Optionen (Ort, Pflichtfelder, Auto-Bestätigung, Aktiv)
 * ------------------------------------------------------------------ */

// Zentrale Quick-Picks für die Schritte 1+2. Bei Bedarf erweiterbar.
const DURATION_PICKS = [15, 30, 45, 60, 90, 120];
const SLOT_INTERVAL_PICKS = [15, 30, 60];
const BUFFER_PICKS = [0, 15, 30, 60];
const LEAD_HOUR_PICKS = [
  { val: 1, label: "1 Stunde" },
  { val: 12, label: "12 Stunden" },
  { val: 24, label: "1 Tag" },
  { val: 48, label: "2 Tage" },
  { val: 72, label: "3 Tage" },
  { val: 168, label: "1 Woche" },
];
const HORIZON_PICKS = [
  { val: 7, label: "1 Woche" },
  { val: 14, label: "2 Wochen" },
  { val: 30, label: "1 Monat" },
  { val: 60, label: "2 Monate" },
  { val: 90, label: "3 Monate" },
  { val: 180, label: "6 Monate" },
  { val: 365, label: "1 Jahr" },
];
const COLOR_PRESETS = ["#9F877F", "#C8102E", "#5C7A6A", "#A37B4F", "#3F4E5F", "#7E5378"];

// Vordefinierte Termin-Orte: Lisa wählt 1+ aus. Die Public-Page zeigt alle als Info.
type LocationKey = "studio" | "phone" | "video" | "home" | "custom";
type LocationPreset = { key: LocationKey; label: string; iconKey: string };
const LOCATION_PRESETS: LocationPreset[] = [
  { key: "studio", label: "Studio / Vor Ort", iconKey: "MapPin" },
  { key: "phone", label: "Telefon", iconKey: "Phone" },
  { key: "video", label: "Online-Meeting", iconKey: "Video" },
  { key: "home", label: "Bei der Kundin", iconKey: "Home" },
];

// Form-Builder: dynamische Felder, die Lisa für die Buchungsseite definiert.
type FormFieldType = "text" | "textarea" | "phone" | "email" | "select" | "checkbox";
type DynamicField = {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // nur für type=select
};
const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Kurzer Text",
  textarea: "Mehrzeiliger Text",
  phone: "Telefon",
  email: "E-Mail",
  select: "Auswahl-Liste",
  checkbox: "Checkbox",
};

// Quick-Add-Vorlagen für häufige Felder. Lisa klickt einmal → Feld wird angelegt.
const FIELD_QUICK_PRESETS: { label: string; field: Omit<DynamicField, "id"> }[] = [
  { label: "Telefon", field: { type: "phone", label: "Telefonnummer", required: true } },
  { label: "Nachricht", field: { type: "textarea", label: "Deine Nachricht", placeholder: "Wünsche, Fragen, Anliegen…", required: false } },
  { label: "Anliegen", field: { type: "textarea", label: "Worum geht's?", placeholder: "Erzähl mir kurz, was du dir wünschst.", required: true } },
  { label: "Wohnort", field: { type: "text", label: "Wohnort", required: false } },
  { label: "Geburtsdatum", field: { type: "text", label: "Geburtsdatum (TT.MM.JJJJ)", placeholder: "z.B. 14.05.1991", required: false } },
];

function makeFieldId(): string {
  return `f_${Math.random().toString(36).slice(2, 9)}`;
}

function safeParseLocations(json: string | null): LocationKey[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.key === "string")
      .map((p) => p.key as LocationKey)
      .filter((k) => ["studio", "phone", "video", "home", "custom"].includes(k));
  } catch {
    return [];
  }
}

function safeParseFields(json: string | null): DynamicField[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && typeof f.id === "string" && typeof f.type === "string" && typeof f.label === "string")
      .map((f) => ({
        id: f.id,
        type: f.type as FormFieldType,
        label: f.label,
        placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
        required: !!f.required,
        options: Array.isArray(f.options) ? f.options.filter((o: any) => typeof o === "string") : undefined,
      }))
      .filter((f) => ["text", "textarea", "phone", "email", "select", "checkbox"].includes(f.type));
  } catch {
    return [];
  }
}

type FormState = {
  name: string;
  description: string;
  durationMin: number;
  color: string;
  slotIntervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minLeadHours: number;
  maxAheadDays: number;
  locations: LocationKey[];
  customLocation: string;     // freier Text bei "Andere…"
  videoProvider: VideoProviderKey | null;
  dynamicFields: DynamicField[];
  autoConfirm: boolean;
  isActive: boolean;
};

function BookingTypeForm({
  type,
  onClose,
}: {
  type?: BookingTypeRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<FormState>(() => {
    // Migration: alte requirePhone/requireMessage in DynamicFields umwandeln,
    // falls noch kein requiredFieldsJson gepflegt wurde.
    const storedFields = safeParseFields(type?.requiredFieldsJson ?? null);
    const dynamicFields = storedFields.length > 0 ? storedFields : (() => {
      const arr: DynamicField[] = [];
      if (type?.requirePhone) {
        arr.push({ id: makeFieldId(), type: "phone", label: "Telefonnummer", required: true });
      }
      if (type?.requireMessage) {
        arr.push({ id: makeFieldId(), type: "textarea", label: "Deine Nachricht", required: true });
      }
      return arr;
    })();

    const storedLocations = safeParseLocations(type?.locationsJson ?? null);

    return {
      name: type?.name ?? "",
      description: type?.description ?? "",
      durationMin: type?.durationMin ?? 30,
      color: type?.color ?? "#9F877F",
      slotIntervalMin: type?.slotIntervalMin ?? 30,
      bufferBeforeMin: type?.bufferBeforeMin ?? 0,
      bufferAfterMin: type?.bufferAfterMin ?? 15,
      minLeadHours: type?.minLeadHours ?? 24,
      maxAheadDays: type?.maxAheadDays ?? 60,
      locations: storedLocations,
      customLocation: type?.location ?? "",
      videoProvider:
        type?.videoProvider && (VIDEO_PROVIDER_ORDER as string[]).includes(type.videoProvider)
          ? (type.videoProvider as VideoProviderKey)
          : null,
      dynamicFields,
      autoConfirm: type?.autoConfirm ?? false,
      isActive: type?.isActive ?? true,
    };
  });

  function update<K extends keyof FormState>(key: K, val: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: val }));
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("name", state.name);
    fd.set("description", state.description);
    fd.set("durationMin", String(state.durationMin));
    fd.set("slotIntervalMin", String(state.slotIntervalMin));
    fd.set("bufferBeforeMin", String(state.bufferBeforeMin));
    fd.set("bufferAfterMin", String(state.bufferAfterMin));
    fd.set("minLeadHours", String(state.minLeadHours));
    fd.set("maxAheadDays", String(state.maxAheadDays));
    // Location als JSON-Liste + Backward-Compat-Feld
    const locationObjs = state.locations.map((k) => {
      if (k === "custom") return { key: "custom", label: state.customLocation.trim() || "Andere" };
      const p = LOCATION_PRESETS.find((p) => p.key === k);
      return { key: k, label: p?.label ?? k };
    });
    fd.set("locationsJson", JSON.stringify(locationObjs));
    fd.set("location", state.customLocation.trim() || locationObjs[0]?.label || "");
    fd.set("color", state.color);

    // Dynamische Form-Felder als JSON
    fd.set("requiredFieldsJson", JSON.stringify(state.dynamicFields));
    // videoProvider nur senden wenn „Online-Meeting" als Ort aktiv ist
    if (state.locations.includes("video") && state.videoProvider) {
      fd.set("videoProvider", state.videoProvider);
    } else {
      fd.set("videoProvider", "");
    }
    // Kein Toggle mehr für requirePhone/requireMessage — wird durch JSON ersetzt.

    if (state.autoConfirm) fd.set("autoConfirm", "on");
    if (state.isActive) fd.set("isActive", "on");
    return fd;
  }

  function addDynamicField(f: Omit<DynamicField, "id">) {
    setState((prev) => ({
      ...prev,
      dynamicFields: [...prev.dynamicFields, { ...f, id: makeFieldId() }],
    }));
  }
  function updateDynamicField(id: string, patch: Partial<DynamicField>) {
    setState((prev) => ({
      ...prev,
      dynamicFields: prev.dynamicFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }
  function removeDynamicField(id: string) {
    setState((prev) => ({
      ...prev,
      dynamicFields: prev.dynamicFields.filter((f) => f.id !== id),
    }));
  }
  function toggleLocation(k: LocationKey) {
    setState((prev) => {
      const has = prev.locations.includes(k);
      return {
        ...prev,
        locations: has ? prev.locations.filter((x) => x !== k) : [...prev.locations, k],
      };
    });
  }

  function onSave() {
    const fd = buildFormData();
    startTransition(async () => {
      try {
        if (type) await updateBookingType(type.id, fd);
        else await createBookingType(fd);
        toast.success(type ? "Aktualisiert" : "Angelegt");
        router.refresh();
        onClose();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler beim Speichern");
      }
    });
  }

  function onDelete() {
    if (!type) return;
    if (!confirm(`„${type.name}" wirklich löschen?\nBereits eingegangene Buchungen? Dann wird der Typ stattdessen nur deaktiviert.`)) return;
    startDeleteTransition(async () => {
      try {
        await deleteBookingType(type.id);
        toast.success("Gelöscht");
        router.refresh();
        onClose();
      } catch (err: any) {
        const msg = err?.message ?? "Konnte nicht löschen";
        if (msg.includes("inaktiv")) {
          toast.success(msg);
          router.refresh();
          onClose();
        } else {
          toast.error(msg);
        }
      }
    });
  }

  const busy = pending || deleting;
  const canProceedFrom1 = state.name.trim().length > 0 && state.durationMin > 0;
  const isLastStep = step === 3;

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <Stepper current={step} onJump={(s) => { if (s < step) setStep(s); }} />

      {/* Step content */}
      {step === 1 && (
        <Step1Basics
          state={state}
          update={update}
        />
      )}
      {step === 2 && (
        <Step2Timing
          state={state}
          update={update}
        />
      )}
      {step === 3 && (
        <Step3Options
          state={state}
          update={update}
          onToggleLocation={toggleLocation}
          onAddField={addDynamicField}
          onUpdateField={updateDynamicField}
          onRemoveField={removeDynamicField}
        />
      )}

      {/* Footer-Navigation */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-stone/60">
        <div>
          {type && step === 1 && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="btn-ghost text-sm"
              style={{ color: "var(--accent)" }}
            >
              <Trash2 size={12} /> Löschen
            </button>
          )}
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={busy}
              className="btn-ghost text-sm"
            >
              <ChevronLeft size={14} /> Zurück
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-ghost text-sm"
          >
            Abbrechen
          </button>
          {!isLastStep ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={busy || (step === 1 && !canProceedFrom1)}
              className="btn-primary text-sm"
            >
              Weiter <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={busy || !canProceedFrom1}
              className="btn-primary text-sm"
            >
              <Save size={12} /> {pending ? "Speichern…" : type ? "Aktualisieren" : "Anlegen"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current, onJump }: { current: number; onJump: (s: number) => void }) {
  const steps = [
    { num: 1, label: "Termin", icon: Sparkles },
    { num: 2, label: "Zeit & Verfügbarkeit", icon: Clock },
    { num: 3, label: "Optionen", icon: SettingsIcon },
  ];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const active = s.num === current;
        const done = s.num < current;
        const clickable = s.num < current;
        return (
          <div key={s.num} className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={() => clickable && onJump(s.num)}
              disabled={!clickable}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: active ? "var(--ink)" : done ? "rgba(120, 167, 119, 0.15)" : "var(--paper)",
                color: active ? "var(--linen)" : done ? "rgb(70, 115, 70)" : "var(--smoke)",
                border: `1px solid ${active ? "var(--ink)" : done ? "rgba(120, 167, 119, 0.4)" : "var(--stone)"}`,
                cursor: clickable ? "pointer" : "default",
              }}
            >
              {done ? <Check size={12} /> : <Icon size={12} />}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.num}</span>
            </button>
            {i < steps.length - 1 && (
              <div className="h-px flex-1" style={{ background: done ? "rgba(120, 167, 119, 0.4)" : "var(--stone)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------- Step 1: Termin-Basics -------------------- */

function Step1Basics({
  state,
  update,
}: {
  state: FormState;
  update: <K extends keyof FormState>(key: K, val: FormState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-smoke">
        <span className="opacity-75">Schritt 1 von 3 —</span> Wie soll der Termin heißen und wie lange dauert er?
      </div>

      <Field label="Wie heißt der Termin? *">
        <input
          type="text"
          value={state.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="z.B. Erstgespräch · Vorgespräch Boudoir · Beratung"
          className="input"
          autoFocus
          required
        />
      </Field>

      <Field label="Kurze Beschreibung" hint="optional · sieht die Kundin auf der Buchungsseite">
        <textarea
          value={state.description}
          onChange={(e) => update("description", e.target.value)}
          rows={2}
          className="textarea text-sm"
          placeholder="z.B. Unverbindliches Kennenlernen per Video-Call. Wir besprechen deine Wünsche und das Konzept."
        />
      </Field>

      <div>
        <label className="label">Wie lange dauert der Termin? *</label>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {DURATION_PICKS.map((d) => (
            <PickerChip
              key={d}
              active={state.durationMin === d}
              onClick={() => update("durationMin", d)}
              label={formatDuration(d)}
            />
          ))}
          <CustomNumberInput
            value={state.durationMin}
            onChange={(v) => update("durationMin", Math.max(5, Math.min(720, v)))}
            unit="Min"
            isCustom={!DURATION_PICKS.includes(state.durationMin)}
            min={5}
            max={720}
            step={5}
          />
        </div>
      </div>

      <div>
        <label className="label">Farbe</label>
        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update("color", c)}
              className="w-7 h-7 rounded-full border-2 transition-transform"
              style={{
                background: c,
                borderColor: state.color === c ? "var(--ink)" : "transparent",
                transform: state.color === c ? "scale(1.1)" : "scale(1)",
              }}
              aria-label={c}
              title={c}
            />
          ))}
          <label className="flex items-center gap-1 ml-2 cursor-pointer">
            <input
              type="color"
              value={state.color}
              onChange={(e) => update("color", e.target.value)}
              className="w-7 h-7 rounded-full border-2 cursor-pointer"
              style={{ borderColor: "var(--stone)", padding: 0 }}
            />
            <span className="text-[10px] text-smoke font-mono">eigene</span>
          </label>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Step 2: Zeit & Verfügbarkeit -------------------- */

function Step2Timing({
  state,
  update,
}: {
  state: FormState;
  update: <K extends keyof FormState>(key: K, val: FormState[K]) => void;
}) {
  return (
    <div className="space-y-7">
      <div className="text-xs text-smoke">
        <span className="opacity-75">Schritt 2 von 3 —</span> Wann sind die Termine buchbar?
      </div>

      <PickerSection label="Slot-Raster" hint="In welchen Schritten werden Startzeiten angeboten?">
        {SLOT_INTERVAL_PICKS.map((v) => (
          <PickerChip
            key={v}
            active={state.slotIntervalMin === v}
            onClick={() => update("slotIntervalMin", v)}
            label={`${v} Minuten`}
          />
        ))}
      </PickerSection>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <PickerSection label="Puffer davor" hint="Vorbereitungszeit">
          {BUFFER_PICKS.map((v) => (
            <PickerChip
              key={v}
              active={state.bufferBeforeMin === v}
              onClick={() => update("bufferBeforeMin", v)}
              label={v === 0 ? "Kein" : `${v} Min`}
            />
          ))}
        </PickerSection>
        <PickerSection label="Puffer danach" hint="Nachbereitung, Reinigung">
          {BUFFER_PICKS.map((v) => (
            <PickerChip
              key={v}
              active={state.bufferAfterMin === v}
              onClick={() => update("bufferAfterMin", v)}
              label={v === 0 ? "Kein" : `${v} Min`}
            />
          ))}
        </PickerSection>
      </div>

      <PickerSection label="Mindest-Vorlauf" hint="Wie kurzfristig kann gebucht werden?">
        {LEAD_HOUR_PICKS.map((p) => (
          <PickerChip
            key={p.val}
            active={state.minLeadHours === p.val}
            onClick={() => update("minLeadHours", p.val)}
            label={p.label}
          />
        ))}
      </PickerSection>

      <PickerSection label="Wie weit in die Zukunft?" hint="Buchungsfenster · letzte Option = Custom">
        {HORIZON_PICKS.map((p) => (
          <PickerChip
            key={p.val}
            active={state.maxAheadDays === p.val}
            onClick={() => update("maxAheadDays", p.val)}
            label={p.label}
          />
        ))}
        <CustomNumberInput
          value={state.maxAheadDays}
          onChange={(v) => update("maxAheadDays", Math.max(1, Math.min(730, v)))}
          unit="Tage"
          isCustom={!HORIZON_PICKS.some((p) => p.val === state.maxAheadDays)}
          min={1}
          max={730}
          step={1}
        />
      </PickerSection>
    </div>
  );
}

/* -------------------- Step 3: Optionen -------------------- */

function Step3Options({
  state,
  update,
  onToggleLocation,
  onAddField,
  onUpdateField,
  onRemoveField,
}: {
  state: FormState;
  update: <K extends keyof FormState>(key: K, val: FormState[K]) => void;
  onToggleLocation: (k: LocationKey) => void;
  onAddField: (f: Omit<DynamicField, "id">) => void;
  onUpdateField: (id: string, patch: Partial<DynamicField>) => void;
  onRemoveField: (id: string) => void;
}) {
  const hasCustom = state.locations.includes("custom");

  return (
    <div className="space-y-7">
      <div className="text-xs text-smoke">
        <span className="opacity-75">Schritt 3 von 3 —</span> Fast geschafft. Wo findet er statt und was brauchst du?
      </div>

      {/* Section: Ort */}
      <div>
        <div className="label mb-2">Wo findet der Termin statt?</div>
        <div className="text-xs text-smoke mb-3">Wähle eine oder mehrere Optionen — wird der Kundin angezeigt.</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {LOCATION_PRESETS.map((p) => (
            <LocationCheckCard
              key={p.key}
              active={state.locations.includes(p.key)}
              onClick={() => onToggleLocation(p.key)}
              iconKey={p.iconKey}
              label={p.label}
            />
          ))}
        </div>
        <div className="mt-2">
          <LocationCheckCard
            active={hasCustom}
            onClick={() => onToggleLocation("custom")}
            iconKey="Plus"
            label="Anderer Ort…"
            wide
          />
          {hasCustom && (
            <input
              type="text"
              value={state.customLocation}
              onChange={(e) => update("customLocation", e.target.value)}
              className="input mt-2"
              placeholder={'z.B. „Im Park", „Im Schloss Reichenbach"…'}
            />
          )}
        </div>
      </div>

      {/* Section: Video-Provider (nur wenn „Online-Meeting" gewählt) */}
      {state.locations.includes("video") && (
        <VideoProviderSection
          provider={state.videoProvider}
          onChange={(p) => update("videoProvider", p)}
        />
      )}

      {/* Section: Form-Builder */}
      <div>
        <div className="label mb-2">Was brauchst du von der Kundin?</div>
        <div className="text-xs text-smoke mb-3">
          Name und E-Mail werden immer abgefragt. Hier kannst du eigene Felder hinzufügen — schnell über Vorlagen oder selbst gestaltet.
        </div>

        {/* Vorlagen */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FIELD_QUICK_PRESETS.map((p) => {
            const already = state.dynamicFields.some(
              (f) => f.type === p.field.type && f.label.toLowerCase() === p.field.label.toLowerCase(),
            );
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => !already && onAddField(p.field)}
                disabled={already}
                className="text-[11px] rounded-full border px-2.5 py-1 transition-colors flex items-center gap-1"
                style={{
                  borderColor: already ? "rgba(120, 167, 119, 0.4)" : "var(--stone)",
                  background: already ? "rgba(120, 167, 119, 0.10)" : "var(--paper)",
                  color: already ? "rgb(70, 115, 70)" : "var(--smoke)",
                  cursor: already ? "default" : "pointer",
                }}
              >
                {already ? <Check size={10} /> : <Plus size={10} />} {p.label}
              </button>
            );
          })}
        </div>

        {/* Field-Liste */}
        {state.dynamicFields.length === 0 ? (
          <div className="text-xs text-smoke italic px-3 py-4 border border-dashed border-stone/60 rounded-lg text-center">
            Noch keine zusätzlichen Felder. Klick eine Vorlage oben oder „+ Eigenes Feld" unten.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {state.dynamicFields.map((f) => (
              <li key={f.id}>
                <FieldEditorRow
                  field={f}
                  onChange={(patch) => onUpdateField(f.id, patch)}
                  onRemove={() => onRemoveField(f.id)}
                />
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() =>
            onAddField({ type: "text", label: "Neues Feld", required: false })
          }
          className="btn-ghost text-xs h-8 mt-2"
        >
          <Plus size={12} /> Eigenes Feld
        </button>
      </div>

      {/* Section: Bestätigung */}
      <div>
        <div className="label mb-2">Wie soll bestätigt werden?</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <ToggleCard
            active={!state.autoConfirm}
            onClick={() => update("autoConfirm", false)}
            icon={<CalendarCheck size={16} />}
            title="Manuell"
            subtitle="Du prüfst jede Anfrage"
          />
          <ToggleCard
            active={state.autoConfirm}
            onClick={() => update("autoConfirm", true)}
            icon={<Zap size={16} />}
            title="Automatisch"
            subtitle="Termin gilt sofort als gebucht"
          />
        </div>
      </div>

      {/* Section: Aktiv */}
      <div>
        <div className="label mb-2">Aktiv?</div>
        <ToggleCard
          active={state.isActive}
          onClick={() => update("isActive", !state.isActive)}
          icon={state.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
          title={state.isActive ? "Aktiv — Kundinnen können buchen" : "Inaktiv — Link funktioniert nicht"}
          subtitle="Jederzeit umschaltbar"
        />
      </div>
    </div>
  );
}

/* -------------------- Location & Field Builder Sub-Components -------------------- */

function VideoProviderSection({
  provider,
  onChange,
}: {
  provider: VideoProviderKey | null;
  onChange: (p: VideoProviderKey | null) => void;
}) {
  return (
    <div>
      <div className="label mb-2 flex items-center gap-2">
        <Video size={12} /> Welches Tool für Online-Meetings?
      </div>
      <div className="text-xs text-smoke mb-3">
        Der hinterlegte persönliche Meeting-Link landet automatisch in der Bestätigung an die Kundin.
        Tipp: Links pflegst du unter{" "}
        <Link href="/einstellungen?tab=kalender" className="underline hover:text-ink">
          Kalender → Online-Meeting-Tools
        </Link>.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {VIDEO_PROVIDER_ORDER.map((key) => {
          const def = VIDEO_PROVIDERS[key];
          const active = provider === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(active ? null : key)}
              className="flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all"
              style={{
                borderColor: active ? def.brandColor : "var(--stone)",
                background: active ? `${def.brandColor}12` : "var(--paper)",
              }}
            >
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center font-medium text-sm"
                style={{
                  background: active ? def.brandColor : "var(--linen)",
                  color: active ? "#fff" : "var(--smoke)",
                }}
              >
                {key === "manual" ? <Mail size={14} /> : def.name.slice(0, 1)}
              </div>
              <div className="text-[11px] font-medium text-center leading-tight">{def.name}</div>
              {active && <Check size={10} style={{ color: def.brandColor }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function locationIcon(iconKey: string): React.ReactNode {
  switch (iconKey) {
    case "MapPin": return <MapPin size={16} />;
    case "Phone": return <Phone size={16} />;
    case "Video": return <Video size={16} />;
    case "Home": return <Home size={16} />;
    case "Plus": return <Plus size={16} />;
    default: return <MapPin size={16} />;
  }
}

function LocationCheckCard({
  active,
  onClick,
  iconKey,
  label,
  wide,
}: {
  active: boolean;
  onClick: () => void;
  iconKey: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all ${wide ? "w-full" : ""}`}
      style={{
        borderColor: active ? "var(--ink)" : "var(--stone)",
        background: active ? "var(--linen)" : "var(--paper)",
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: active ? "var(--ink)" : "transparent",
          color: active ? "var(--linen)" : "var(--smoke)",
          border: `1px solid ${active ? "var(--ink)" : "var(--stone)"}`,
        }}
      >
        {locationIcon(iconKey)}
      </div>
      <div className="text-sm font-medium leading-tight flex-1">{label}</div>
      {active && <Check size={14} className="shrink-0" style={{ color: "var(--ink)" }} />}
    </button>
  );
}

function fieldTypeIcon(t: FormFieldType): React.ReactNode {
  switch (t) {
    case "text": return <TypeIcon size={12} />;
    case "textarea": return <AlignLeft size={12} />;
    case "phone": return <Phone size={12} />;
    case "email": return <Mail size={12} />;
    case "select": return <ChevronDown size={12} />;
    case "checkbox": return <Check size={12} />;
  }
}

function FieldEditorRow({
  field,
  onChange,
  onRemove,
}: {
  field: DynamicField;
  onChange: (patch: Partial<DynamicField>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="rounded-lg border bg-paper transition-colors"
      style={{ borderColor: "var(--stone)" }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical size={14} className="text-smoke shrink-0 opacity-50" />
        <div
          className="w-6 h-6 rounded shrink-0 flex items-center justify-center"
          style={{ background: "var(--linen)", color: "var(--smoke)" }}
        >
          {fieldTypeIcon(field.type)}
        </div>
        <input
          type="text"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 bg-transparent text-sm font-medium border-0 focus:outline-none focus:ring-0 p-0"
          placeholder="Feld-Beschriftung"
        />
        <label className="flex items-center gap-1 text-[10px] text-smoke cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="w-3 h-3"
          />
          Pflicht
        </label>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-icon"
          title="Details"
        >
          <ChevronDown
            size={13}
            style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="btn-icon"
          style={{ color: "var(--accent)" }}
          title="Feld entfernen"
        >
          <X size={13} />
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-stone/60 pt-2 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-smoke">Typ</label>
              <select
                value={field.type}
                onChange={(e) => onChange({ type: e.target.value as FormFieldType })}
                className="select h-8 text-sm mt-0.5"
              >
                {(Object.entries(FIELD_TYPE_LABELS) as [FormFieldType, string][]).map(([k, lbl]) => (
                  <option key={k} value={k}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-smoke">Platzhalter</label>
              <input
                type="text"
                value={field.placeholder ?? ""}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                className="input h-8 text-sm mt-0.5"
                placeholder={'z.B. „Optional, falls bekannt"…'}
              />
            </div>
          </div>
          {field.type === "select" && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-smoke">Optionen (eine pro Zeile)</label>
              <textarea
                value={(field.options ?? []).join("\n")}
                onChange={(e) => onChange({
                  options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                })}
                rows={3}
                className="textarea text-sm mt-0.5"
                placeholder={"Boudoir\nFamily\nBusiness"}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------- Sub-Components -------------------- */

function PickerSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="label flex items-baseline gap-2">
        {label}
        {hint && <span className="text-xs text-smoke font-normal opacity-75">· {hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">{children}</div>
    </div>
  );
}

function PickerChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-all"
      style={{
        borderColor: active ? "var(--ink)" : "var(--stone)",
        background: active ? "var(--ink)" : "var(--paper)",
        color: active ? "var(--linen)" : "var(--ink)",
      }}
    >
      {label}
    </button>
  );
}

function CustomNumberInput({
  value,
  onChange,
  unit,
  isCustom,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  unit: string;
  isCustom: boolean;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label
      className="rounded-full border flex items-center gap-1 pl-3 pr-2 py-0.5 text-xs cursor-text"
      style={{
        borderColor: isCustom ? "var(--ink)" : "var(--stone)",
        background: isCustom ? "var(--paper)" : "var(--paper)",
        color: isCustom ? "var(--ink)" : "var(--smoke)",
      }}
    >
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="bg-transparent w-12 text-center tabular-nums focus:outline-none p-0 border-0"
      />
      <span className="opacity-75">{unit}</span>
    </label>
  );
}

function ToggleCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border p-3 text-left transition-all"
      style={{
        borderColor: active ? "var(--ink)" : "var(--stone)",
        background: active ? "var(--linen)" : "var(--paper)",
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: active ? "var(--ink)" : "transparent",
          color: active ? "var(--linen)" : "var(--smoke)",
          border: `1px solid ${active ? "var(--ink)" : "var(--stone)"}`,
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight">{title}</div>
        <div className="text-[11px] text-smoke mt-0.5">{subtitle}</div>
      </div>
      {active && <Check size={14} className="shrink-0" style={{ color: "var(--ink)" }} />}
    </button>
  );
}
