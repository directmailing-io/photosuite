"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Plus, Save, Trash2, Info } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/form/Field";
import { saveWeeklyRules, upsertOverride, deleteOverride } from "./availabilityActions";

const WEEKDAY_LABELS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
// Display-Reihenfolge Mo..So, intern bleiben wir bei 0=So
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type WeeklyRow = { weekday: number; maxShootings: number };
export type OverrideRow = { id: string; date: string; maxShootings: number; note: string | null };

export function AvailabilityManager({
  weekly,
  overrides,
}: {
  weekly: WeeklyRow[];
  overrides: OverrideRow[];
}) {
  return (
    <div className="space-y-4">
      <WeeklyEditor weekly={weekly} />
      <OverrideEditor overrides={overrides} />
    </div>
  );
}

function WeeklyEditor({ weekly }: { weekly: WeeklyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (let w = 0; w < 7; w++) m[w] = 0;
    for (const w of weekly) m[w.weekday] = w.maxShootings;
    return m;
  });

  function set(weekday: number, max: number) {
    setValues((prev) => ({ ...prev, [weekday]: Math.max(0, Math.min(10, max)) }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const w of WEEKDAY_ORDER) fd.append(`weekly.${w}.max`, String(values[w] ?? 0));
    startTransition(async () => {
      try {
        await saveWeeklyRules(fd);
        toast.success("Wochenregel gespeichert");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  const totalPerWeek = WEEKDAY_ORDER.reduce((sum, w) => sum + (values[w] ?? 0), 0);

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="px-6 py-4 border-b border-stone/60">
        <div className="eyebrow eyebrow-muted">Standard-Wochenregel</div>
        <div className="text-sm text-smoke mt-1">
          Wie viele Shootings nimmst du an einem Wochentag standardmäßig an?
          <span className="ml-1">Einzelne Tage kannst du unten als Ausnahme überschreiben.</span>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAY_ORDER.map((w) => {
            const max = values[w] ?? 0;
            const isClosed = max === 0;
            return (
              <div
                key={w}
                className="rounded-lg border p-3 text-center transition"
                style={{
                  borderColor: isClosed ? "var(--stone)" : "var(--accent)",
                  background: isClosed ? "var(--paper)" : "rgba(120, 167, 119, 0.08)",
                }}
              >
                <div className="text-xs uppercase tracking-wider text-smoke">{WEEKDAY_LABELS[w].slice(0, 2)}</div>
                <div className="text-[10px] text-smoke mb-2">{WEEKDAY_LABELS[w]}</div>
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => set(w, max - 1)}
                    className="w-6 h-6 rounded border border-stone hover:bg-linen text-sm leading-none"
                    aria-label="Weniger"
                  >−</button>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={max}
                    onChange={(e) => set(w, Number(e.target.value))}
                    className="w-10 text-center text-sm font-medium tabular-nums bg-transparent border-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => set(w, max + 1)}
                    className="w-6 h-6 rounded border border-stone hover:bg-linen text-sm leading-none"
                    aria-label="Mehr"
                  >+</button>
                </div>
                <div className="text-[10px] text-smoke mt-1">
                  {isClosed ? "zu" : `${max} ${max === 1 ? "Slot" : "Slots"}`}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between pt-4 border-t border-stone/60">
          <div className="text-xs text-smoke flex items-center gap-1.5">
            <Info size={12} /> Insgesamt {totalPerWeek} {totalPerWeek === 1 ? "Slot" : "Slots"} pro Woche.
          </div>
          <button type="submit" disabled={pending} className="btn-primary text-sm">
            <Save size={13} /> {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </form>
  );
}

function OverrideEditor({ overrides }: { overrides: OverrideRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  // Vergangene Ausnahmen ausblenden, aber nicht löschen — Lisa kann nachsehen.
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const upcoming = overrides.filter((o) => o.date >= todayYmd);
  const past = overrides.filter((o) => o.date < todayYmd);

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
        <div>
          <div className="eyebrow eyebrow-muted">Ausnahmen</div>
          <div className="text-sm text-smoke mt-1">
            Urlaub, Feiertage, Sondertage — Wochenregel überschreiben.
          </div>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-primary text-xs h-9">
            <Plus size={13} /> Ausnahme
          </button>
        )}
      </div>

      {adding && (
        <div className="px-6 py-5 bg-linen/40 border-b border-stone/60">
          <OverrideForm
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); router.refresh(); }}
          />
        </div>
      )}

      {upcoming.length === 0 && !adding ? (
        <div className="px-6 py-10 text-center text-sm text-smoke">
          Keine geplanten Ausnahmen.
        </div>
      ) : (
        <ul className="divide-y divide-stone/60">
          {upcoming.map((o) => <OverrideRowView key={o.id} override={o} />)}
        </ul>
      )}

      {past.length > 0 && (
        <details className="px-6 py-3 border-t border-stone/60 text-sm">
          <summary className="cursor-pointer text-smoke hover:text-ink">
            Vergangene Ausnahmen ({past.length})
          </summary>
          <ul className="mt-3 space-y-1">
            {past.map((o) => (
              <li key={o.id} className="text-xs text-smoke flex items-center justify-between">
                <span>{formatYmd(o.date)} — {o.maxShootings === 0 ? "gesperrt" : `${o.maxShootings} Slots`}{o.note && ` (${o.note})`}</span>
                <DeleteOverrideButton id={o.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function OverrideRowView({ override }: { override: OverrideRow }) {
  return (
    <li className="px-6 py-3 flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: override.maxShootings === 0 ? "var(--linen)" : "rgba(120, 167, 119, 0.15)",
          color: override.maxShootings === 0 ? "var(--smoke)" : "rgb(80, 130, 80)",
        }}
      >
        {override.maxShootings === 0 ? <CalendarOff size={16} /> : (
          <span className="text-sm font-medium tabular-nums">{override.maxShootings}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{formatYmd(override.date)}</div>
        <div className="text-xs text-smoke mt-0.5">
          {override.maxShootings === 0 ? "Gesperrt" : `${override.maxShootings} ${override.maxShootings === 1 ? "Slot" : "Slots"}`}
          {override.note && <span> · {override.note}</span>}
        </div>
      </div>
      <DeleteOverrideButton id={override.id} />
    </li>
  );
}

function DeleteOverrideButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onClick() {
    if (!confirm("Ausnahme entfernen?")) return;
    startTransition(async () => {
      try {
        await deleteOverride(id);
        toast.success("Entfernt");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }
  return (
    <button onClick={onClick} disabled={pending} className="btn-icon" style={{ color: "var(--accent)" }} title="Entfernen">
      <Trash2 size={13} />
    </button>
  );
}

function OverrideForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [maxShootings, setMaxShootings] = useState(0);
  const [note, setNote] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("date", date);
    fd.set("maxShootings", String(maxShootings));
    fd.set("note", note);
    startTransition(async () => {
      try {
        await upsertOverride(fd);
        toast.success("Ausnahme gespeichert");
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Datum *">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="input h-9 text-sm"
          />
        </Field>
        <Field label="Slots an dem Tag" hint="0 = gesperrt">
          <input
            type="number"
            min="0"
            max="10"
            value={maxShootings}
            onChange={(e) => setMaxShootings(Number(e.target.value))}
            className="input h-9 text-sm"
          />
        </Field>
        <Field label="Notiz" hint="optional">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Urlaub, Feiertag …"
            className="input h-9 text-sm"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onClose} className="btn-ghost text-sm" disabled={pending}>
          Abbrechen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={12} /> {pending ? "Speichern…" : "Anlegen"}
        </button>
      </div>
    </form>
  );
}

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
