"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Trash2, Pencil, MapPin, Calendar, Clock, Check, X } from "lucide-react";
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
};

function toInputDT(d?: string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DatesManager({ shootingId, dates }: { shootingId: string; dates: DateItem[] }) {
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
                  <div>
                    <div className="font-medium text-sm">{d.label}</div>
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
  onSubmit,
  onCancel,
}: {
  initial?: DateItem;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(new FormData(e.currentTarget)); } catch (err: any) { toast.error(err?.message ?? "Fehler"); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="card p-3 space-y-2 bg-linen/40">
      <input name="label" defaultValue={initial?.label ?? "Shooting"} placeholder="Bezeichnung — Fitting, Shooting, Bildauswahl …" className="input h-9 text-sm" required />
      <div className="grid grid-cols-2 gap-2">
        <input type="datetime-local" name="startAt" defaultValue={toInputDT(initial?.startAt)} className="input h-9 text-sm" required />
        <input type="datetime-local" name="endAt" defaultValue={toInputDT(initial?.endAt)} className="input h-9 text-sm" />
      </div>
      <input name="location" defaultValue={initial?.location ?? ""} placeholder="Ort — z.B. Studio Bamberg" className="input h-9 text-sm" />
      <input name="locationUrl" defaultValue={initial?.locationUrl ?? ""} placeholder="Maps-Link (optional)" className="input h-9 text-sm" />
      <textarea name="description" defaultValue={initial?.description ?? ""} rows={2} placeholder="Info für die Kundin (optional)" className="textarea text-sm" />
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="btn-ghost h-8"><X size={14} /></button>
        <button disabled={busy} className="btn-primary h-8 px-3"><Check size={14} /> {busy ? "…" : "Speichern"}</button>
      </div>
    </form>
  );
}
