"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Trash2, Pencil, MapPin, Calendar, Clock, Check, X, RefreshCw, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { addShootingDate, updateShootingDate, deleteShootingDate } from "../actions";
import { formatDateTime } from "@/lib/utils";

type DateItem = {
  id: string;
  label: string;
  startAt: string;
  endAt: string | null;
  location: string | null;
  locationUrl: string | null;
  description: string | null;
  syncToCalendar: boolean;
  attachmentIds: string[];
};

export type AvailableAttachment = {
  id: string;
  filename: string;
};

// Voreingestellte Termin-Arten — Lisa wählt schnell aus, Eigenes-Feld bleibt.
const LABEL_PRESETS = ["Beratung", "Fitting", "Shooting", "Bildauswahl", "Aftershoot"] as const;

// Voreingestellte Orte — analog zum Buchungslink. „Andere" → freitext.
const LOCATION_PRESETS = ["Studio Bamberg", "Telefon", "Video-Call", "Bei der Kundin"] as const;

function toInputDT(d?: string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Addiert N Stunden zu einem datetime-local-String und gibt denselben Format zurück.
function addHoursLocal(value: string, hours: number): string {
  if (!value) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  d.setHours(d.getHours() + hours);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DatesManager({
  shootingId,
  dates,
  attachments,
  hasCalendarConnection,
  emailEnabled,
  emailNotifyDefault,
  customerEmail,
}: {
  shootingId: string;
  dates: DateItem[];
  attachments: AvailableAttachment[];
  hasCalendarConnection: boolean;
  emailEnabled: boolean;
  emailNotifyDefault: boolean;
  customerEmail: string | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function onDelete(id: string) {
    if (!confirm("Termin löschen?")) return;
    await deleteShootingDate(id, shootingId);
    toast.success("Termin gelöscht");
    router.refresh();
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow eyebrow-muted flex items-center gap-2"><Calendar size={13} /> Termine</div>
        <button onClick={() => { setAdding(true); setEditing(null); }} className="btn-secondary text-xs h-8">
          <CalendarPlus size={13} /> Neuer Termin
        </button>
      </div>

      {dates.length === 0 && !adding && (
        <div className="text-sm text-smoke text-center py-6">
          Noch keine Termine. Plane Fitting, Shooting, Bildauswahl …
        </div>
      )}

      <ol className="relative space-y-3">
        {dates.map((d, idx) => (
          <li key={d.id} className="relative pl-7">
            <span className="absolute left-0 top-2 w-3.5 h-3.5 rounded-full bg-bg border-2 border-accent" />
            {idx < dates.length - 1 && (
              <span className="absolute left-[6.5px] top-6 bottom-[-12px] w-px bg-stone" />
            )}

            {editing === d.id ? (
              <DateForm
                initial={d}
                attachments={attachments}
                hasCalendarConnection={hasCalendarConnection}
                emailEnabled={emailEnabled}
                emailNotifyDefault={emailNotifyDefault}
                customerEmail={customerEmail}
                onCancel={() => setEditing(null)}
                onSubmit={async (fd) => {
                  await updateShootingDate(d.id, shootingId, fd);
                  setEditing(null);
                  toast.success("Termin gespeichert");
                  router.refresh();
                }}
              />
            ) : (
              <div className="group">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      <span>{d.label}</span>
                      {d.syncToCalendar && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{
                            background: "rgb(var(--success-soft))",
                            color: "rgb(var(--success-deep))",
                          }}
                          title="Wird in deinen Kalender exportiert"
                        >
                          <RefreshCw size={9} /> Sync
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-smoke mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1"><Clock size={11} /> {formatDateTime(d.startAt)}{d.endAt && ` – ${new Date(d.endAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}</span>
                      {d.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} />
                          {d.locationUrl ? (
                            <a href={d.locationUrl} target="_blank" className="hover:underline">{d.location}</a>
                          ) : d.location}
                        </span>
                      )}
                      {d.attachmentIds.length > 0 && (
                        <span className="flex items-center gap-1" title="Zugeordnete Dateien">
                          <Paperclip size={11} /> {d.attachmentIds.length}
                        </span>
                      )}
                    </div>
                    {d.description && (
                      <div className="text-xs text-ink/70 mt-1.5 whitespace-pre-wrap">{d.description}</div>
                    )}
                  </div>
                  <div className="flex opacity-0 group-hover:opacity-100">
                    <button onClick={() => setEditing(d.id)} className="btn-icon"><Pencil size={13} /></button>
                    <button onClick={() => onDelete(d.id)} className="btn-icon"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}

        {adding && (
          <li className="relative pl-7">
            <span className="absolute left-0 top-2 w-3.5 h-3.5 rounded-full bg-accent border-2 border-bg" />
            <DateForm
              attachments={attachments}
              hasCalendarConnection={hasCalendarConnection}
              emailEnabled={emailEnabled}
              emailNotifyDefault={emailNotifyDefault}
              customerEmail={customerEmail}
              onCancel={() => setAdding(false)}
              onSubmit={async (fd) => {
                await addShootingDate(shootingId, fd);
                setAdding(false);
                toast.success("Termin angelegt");
                router.refresh();
              }}
            />
          </li>
        )}
      </ol>
    </div>
  );
}

function DateForm({
  initial,
  attachments,
  hasCalendarConnection,
  emailEnabled,
  emailNotifyDefault,
  customerEmail,
  onSubmit,
  onCancel,
}: {
  initial?: DateItem;
  attachments: AvailableAttachment[];
  hasCalendarConnection: boolean;
  emailEnabled: boolean;
  emailNotifyDefault: boolean;
  customerEmail: string | null;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [syncToCalendar, setSyncToCalendar] = useState<boolean>(initial?.syncToCalendar ?? false);
  const [notifyCustomer, setNotifyCustomer] = useState<boolean>(emailNotifyDefault && !!customerEmail);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(
    () => new Set(initial?.attachmentIds ?? []),
  );

  function toggleAttachment(id: string) {
    setSelectedAttachmentIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Termin-Art (Label) — Dropdown mit Voreinstellungen + Custom.
  // Initial: bekanntes Preset → Dropdown auf das Preset; sonst → custom mit dem alten Text.
  const isPresetLabel = !!initial?.label && LABEL_PRESETS.includes(initial.label as any);
  const [labelMode, setLabelMode] = useState<"preset" | "custom">(
    !initial?.label || isPresetLabel ? "preset" : "custom",
  );
  const [labelPreset, setLabelPreset] = useState<string>(
    isPresetLabel ? initial!.label : LABEL_PRESETS[2], // default „Shooting"
  );
  const [labelCustom, setLabelCustom] = useState<string>(!isPresetLabel ? initial?.label ?? "" : "");

  // Ort — Dropdown mit Voreinstellungen + Custom.
  const isPresetLocation = !!initial?.location && LOCATION_PRESETS.includes(initial.location as any);
  const [locationMode, setLocationMode] = useState<"preset" | "custom">(
    !initial?.location || isPresetLocation ? "preset" : "custom",
  );
  const [locationPreset, setLocationPreset] = useState<string>(
    isPresetLocation ? initial!.location! : LOCATION_PRESETS[0],
  );
  const [locationCustom, setLocationCustom] = useState<string>(!isPresetLocation ? initial?.location ?? "" : "");

  // End-Datum mit Auto-Fill: wenn User End nicht manuell gesetzt hat, wird beim
  // Ändern von Start automatisch Start+2h übernommen. Manuelle Änderungen
  // bleiben erhalten.
  const [startAt, setStartAt] = useState<string>(toInputDT(initial?.startAt));
  const [endAt, setEndAt] = useState<string>(toInputDT(initial?.endAt));
  const [endTouched, setEndTouched] = useState<boolean>(!!initial?.endAt);

  function onStartChange(v: string) {
    setStartAt(v);
    if (!endTouched && v) {
      setEndAt(addHoursLocal(v, 2));
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      // Termin-Art aus Mode auflösen.
      const labelFinal = labelMode === "preset" ? labelPreset : labelCustom.trim();
      if (!labelFinal) {
        toast.error("Termin-Art ist Pflicht");
        setBusy(false);
        return;
      }
      fd.set("label", labelFinal);
      // Ort aus Mode auflösen — leer ist erlaubt.
      const locationFinal = locationMode === "preset" ? locationPreset : locationCustom.trim();
      fd.set("location", locationFinal);
      // Start/End aus State (kontrollierte Inputs).
      fd.set("startAt", startAt);
      fd.set("endAt", endAt);
      // Sync-Toggle (checkbox als "on"/missing — wir setzen explizit).
      fd.delete("syncToCalendar");
      if (syncToCalendar) fd.set("syncToCalendar", "on");
      // Notify-Toggle für Email-Versand an Kundin.
      fd.delete("notifyCustomer");
      if (notifyCustomer) fd.set("notifyCustomer", "on");
      // Attachment-IDs — alle ausgewählten als multiple Werte appenden.
      fd.delete("attachmentIds");
      selectedAttachmentIds.forEach((id) => fd.append("attachmentIds", id));
      await onSubmit(fd);
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-3 space-y-2 bg-linen/40">
      {/* Termin-Art: Dropdown + Toggle „Eigenes" */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        {labelMode === "preset" ? (
          <select
            value={labelPreset}
            onChange={(e) => setLabelPreset(e.target.value)}
            className="select h-9 text-sm"
          >
            {LABEL_PRESETS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        ) : (
          <input
            value={labelCustom}
            onChange={(e) => setLabelCustom(e.target.value)}
            placeholder="Eigene Termin-Art — z.B. Locationscouting"
            className="input h-9 text-sm"
            autoFocus
          />
        )}
        <button
          type="button"
          onClick={() => setLabelMode((m) => (m === "preset" ? "custom" : "preset"))}
          className="text-[10px] text-smoke hover:text-ink underline whitespace-nowrap px-1"
        >
          {labelMode === "preset" ? "individuell" : "← Vorlage"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="datetime-local"
          name="startAt"
          value={startAt}
          onChange={(e) => onStartChange(e.target.value)}
          className="input h-9 text-sm"
          required
        />
        <input
          type="datetime-local"
          name="endAt"
          value={endAt}
          onChange={(e) => { setEndAt(e.target.value); setEndTouched(true); }}
          className="input h-9 text-sm"
          title="Ende — wird automatisch auf Start + 2 Std vorgeschlagen"
        />
      </div>

      {/* Ort: Dropdown + Toggle „Eigenes" */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        {locationMode === "preset" ? (
          <select
            value={locationPreset}
            onChange={(e) => setLocationPreset(e.target.value)}
            className="select h-9 text-sm"
          >
            {LOCATION_PRESETS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        ) : (
          <input
            value={locationCustom}
            onChange={(e) => setLocationCustom(e.target.value)}
            placeholder="Eigener Ort — z.B. Schloss Seehof"
            className="input h-9 text-sm"
            autoFocus
          />
        )}
        <button
          type="button"
          onClick={() => setLocationMode((m) => (m === "preset" ? "custom" : "preset"))}
          className="text-[10px] text-smoke hover:text-ink underline whitespace-nowrap px-1"
        >
          {locationMode === "preset" ? "individuell" : "← Vorlage"}
        </button>
      </div>

      <input name="locationUrl" defaultValue={initial?.locationUrl ?? ""} placeholder="Maps-Link (optional)" className="input h-9 text-sm" />
      <textarea name="description" defaultValue={initial?.description ?? ""} rows={2} placeholder="Info für die Kundin (optional)" className="textarea text-sm" />

      {/* Kalender-Sync: opt-in pro Termin. Nur sichtbar, wenn überhaupt eine
          Verbindung existiert — sonst greift der Toggle nicht. */}
      <label
        className="flex items-start gap-2 text-xs p-2 rounded-md cursor-pointer"
        style={{
          background: hasCalendarConnection ? "rgb(var(--linen))" : "transparent",
          opacity: hasCalendarConnection ? 1 : 0.5,
          cursor: hasCalendarConnection ? "pointer" : "not-allowed",
        }}
      >
        <input
          type="checkbox"
          checked={syncToCalendar}
          onChange={(e) => setSyncToCalendar(e.target.checked)}
          disabled={!hasCalendarConnection}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="font-medium" style={{ color: "rgb(var(--ink))" }}>
            In Kalender übertragen
          </div>
          <div style={{ color: "rgb(var(--taupe))" }}>
            {hasCalendarConnection
              ? "Termin wird in deinen verbundenen Kalender exportiert."
              : "Erst Kalender unter Einstellungen → Kalender verbinden."}
          </div>
        </div>
      </label>

      {/* Email-Notify-Toggle: Kundin per E-Mail informieren. Nur sichtbar wenn
          SMTP konfiguriert UND Kundin eine E-Mail hat. */}
      {emailEnabled && customerEmail && (
        <label className="flex items-start gap-2 text-xs p-2 rounded-md cursor-pointer" style={{ background: "rgb(var(--linen))" }}>
          <input
            type="checkbox"
            checked={notifyCustomer}
            onChange={(e) => setNotifyCustomer(e.target.checked)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="font-medium" style={{ color: "rgb(var(--ink))" }}>
              Kundin per E-Mail benachrichtigen
            </div>
            <div style={{ color: "rgb(var(--taupe))" }}>
              Sendet eine Update-Mail an {customerEmail}.
            </div>
          </div>
        </label>
      )}

      {/* Datei-Zuordnung: bestehende Anhänge des Shootings können diesem Termin
          zugeordnet werden (z.B. Fitting-Checkliste). */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold flex items-center gap-1">
            <Paperclip size={10} /> Dateien zum Termin
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a) => {
              const checked = selectedAttachmentIds.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAttachment(a.id)}
                  className="text-[11px] rounded-full border px-2 py-0.5 transition-colors flex items-center gap-1"
                  style={{
                    borderColor: checked ? "rgb(70, 115, 70)" : "rgb(var(--stone))",
                    background: checked ? "rgba(120, 167, 119, 0.12)" : "rgb(var(--paper))",
                    color: checked ? "rgb(70, 115, 70)" : "rgb(var(--taupe))",
                  }}
                >
                  {checked ? <Check size={9} /> : <Paperclip size={9} />} {a.filename}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="btn-ghost h-8"><X size={14} /></button>
        <button disabled={busy} className="btn-primary h-8 px-3"><Check size={14} /> {busy ? "…" : "Speichern"}</button>
      </div>
    </form>
  );
}
