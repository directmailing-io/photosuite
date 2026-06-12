"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, FormRow } from "@/components/form/Field";
import {
  Plus, Trash2, Pencil, Save, X, Eye, EyeOff, Copy, CalendarCheck, Clock, ExternalLink,
} from "lucide-react";
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
    fd.set("slug", type.slug);
    fd.set("description", type.description ?? "");
    fd.set("durationMin", String(type.durationMin));
    fd.set("price", String(type.priceCents / 100));
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
          <span>{type.priceCents === 0 ? "kostenlos" : formatEUR(type.priceCents)}</span>
          <span className="opacity-40">·</span>
          <span className="truncate">/b/{type.slug}</span>
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

function BookingTypeForm({
  type,
  onClose,
}: {
  type?: BookingTypeRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [color, setColor] = useState<string>(type?.color ?? "#9F877F");
  const [deleting, startDeleteTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

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

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormRow>
        <Field label="Name *">
          <input
            name="name"
            defaultValue={type?.name ?? ""}
            required
            className="input h-9 text-sm"
            placeholder="z.B. Erstgespräch 30 Min"
          />
        </Field>
        <Field label="Slug" hint="optional — wird automatisch generiert">
          <input
            name="slug"
            defaultValue={type?.slug ?? ""}
            className="input h-9 text-sm font-mono"
            placeholder="z.B. erstgespraech"
          />
        </Field>
      </FormRow>

      <Field label="Beschreibung" hint="optional, wird der Kundin auf der Buchungsseite gezeigt">
        <textarea
          name="description"
          defaultValue={type?.description ?? ""}
          rows={2}
          className="textarea text-sm"
          placeholder="z.B. Unverbindliches Kennenlernen per Video-Call. Wir besprechen deine Wünsche und das Konzept."
        />
      </Field>

      <FormRow>
        <Field label="Dauer (Minuten) *">
          <input
            name="durationMin"
            type="number"
            min={5}
            max={720}
            step={5}
            defaultValue={type?.durationMin ?? 30}
            required
            className="input h-9 text-sm tabular-nums"
          />
        </Field>
        <Field label="Preis (€)" hint="0 = kostenlos">
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={type ? (type.priceCents / 100).toFixed(2) : "0"}
            className="input h-9 text-sm tabular-nums"
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Slot-Intervall" hint="Raster, in dem Termine angeboten werden">
          <select
            name="slotIntervalMin"
            defaultValue={type?.slotIntervalMin ?? 30}
            className="select h-9 text-sm"
          >
            <option value={15}>15 Minuten</option>
            <option value={30}>30 Minuten</option>
            <option value={60}>60 Minuten</option>
          </select>
        </Field>
        <Field label="Ort" hint="optional — z.B. Studio, Video-Call">
          <input
            name="location"
            defaultValue={type?.location ?? ""}
            className="input h-9 text-sm"
            placeholder="z.B. Studio Köln · Video-Call · Vor-Ort"
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Puffer davor (Min)" hint="Vorbereitungszeit vor dem Termin">
          <input
            name="bufferBeforeMin"
            type="number"
            min={0}
            max={240}
            step={5}
            defaultValue={type?.bufferBeforeMin ?? 0}
            className="input h-9 text-sm tabular-nums"
          />
        </Field>
        <Field label="Puffer danach (Min)" hint="Nachbereitung / Reinigung">
          <input
            name="bufferAfterMin"
            type="number"
            min={0}
            max={240}
            step={5}
            defaultValue={type?.bufferAfterMin ?? 15}
            className="input h-9 text-sm tabular-nums"
          />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Vorlaufzeit (Stunden)" hint="Min. Stunden zwischen Buchung und Termin">
          <input
            name="minLeadHours"
            type="number"
            min={0}
            max={168}
            step={1}
            defaultValue={type?.minLeadHours ?? 24}
            className="input h-9 text-sm tabular-nums"
          />
        </Field>
        <Field label="Buchungsfenster (Tage)" hint="Wie weit in die Zukunft buchbar">
          <input
            name="maxAheadDays"
            type="number"
            min={1}
            max={365}
            step={1}
            defaultValue={type?.maxAheadDays ?? 60}
            className="input h-9 text-sm tabular-nums"
          />
        </Field>
      </FormRow>

      <div className="flex items-center gap-4 pt-1">
        <Field label="Farbe">
          <div className="flex items-center gap-2">
            <input
              name="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 rounded border border-stone cursor-pointer bg-paper"
              style={{ padding: 2 }}
            />
            <span className="text-xs text-smoke font-mono tabular-nums">{color}</span>
          </div>
        </Field>
        <div className="flex-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-stone/60">
        <label className="flex items-center gap-2 text-xs text-smoke cursor-pointer py-1">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={type?.isActive ?? true}
            className="w-3.5 h-3.5"
          />
          Aktiv (für Kundinnen sichtbar &amp; buchbar)
        </label>
        <label className="flex items-center gap-2 text-xs text-smoke cursor-pointer py-1">
          <input
            type="checkbox"
            name="autoConfirm"
            defaultChecked={type?.autoConfirm ?? false}
            className="w-3.5 h-3.5"
          />
          Automatisch bestätigen (sonst zuerst „Anfrage")
        </label>
        <label className="flex items-center gap-2 text-xs text-smoke cursor-pointer py-1">
          <input
            type="checkbox"
            name="requirePhone"
            defaultChecked={type?.requirePhone ?? false}
            className="w-3.5 h-3.5"
          />
          Telefonnummer verpflichtend
        </label>
        <label className="flex items-center gap-2 text-xs text-smoke cursor-pointer py-1">
          <input
            type="checkbox"
            name="requireMessage"
            defaultChecked={type?.requireMessage ?? false}
            className="w-3.5 h-3.5"
          />
          Nachricht der Kundin verpflichtend
        </label>
      </div>

      <div className="flex justify-between items-center gap-2 pt-3 border-t border-stone/60">
        <div>
          {type && (
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
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-ghost text-sm"
          >
            <X size={12} /> Abbrechen
          </button>
          <button type="submit" disabled={busy} className="btn-primary text-sm">
            <Save size={12} /> {pending ? "Speichern…" : type ? "Aktualisieren" : "Anlegen"}
          </button>
        </div>
      </div>
    </form>
  );
}
