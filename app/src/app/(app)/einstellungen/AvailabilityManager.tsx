"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Plus, Save, Trash2, Info, Clock } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/form/Field";
import { saveWeeklyRules, upsertOverride, deleteOverride } from "./availabilityActions";

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAY_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
// Display-Reihenfolge Mo..So, intern bleiben wir bei 0=So
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export type WeeklyRow = {
  weekday: number;
  maxShootings: number;
  startMinutes: number | null;
  endMinutes: number | null;
};
export type OverrideRow = {
  id: string;
  date: string;
  maxShootings: number;
  startMinutes: number | null;
  endMinutes: number | null;
  note: string | null;
};

function minutesToHHMM(min: number | null | undefined): string {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
      <WeeklyPreview weekly={weekly} overrides={overrides} />
      <OverrideEditor overrides={overrides} />
    </div>
  );
}

type WeeklyState = { max: number; start: string; end: string };

function WeeklyEditor({ weekly }: { weekly: WeeklyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<number, WeeklyState>>(() => {
    const m: Record<number, WeeklyState> = {};
    for (let w = 0; w < 7; w++) m[w] = { max: 0, start: "", end: "" };
    for (const w of weekly) {
      m[w.weekday] = {
        max: w.maxShootings,
        start: minutesToHHMM(w.startMinutes),
        end: minutesToHHMM(w.endMinutes),
      };
    }
    return m;
  });

  function setMax(weekday: number, max: number) {
    setValues((prev) => ({
      ...prev,
      [weekday]: { ...prev[weekday], max: Math.max(0, Math.min(10, max)) },
    }));
  }
  function setStart(weekday: number, start: string) {
    setValues((prev) => ({ ...prev, [weekday]: { ...prev[weekday], start } }));
  }
  function setEnd(weekday: number, end: string) {
    setValues((prev) => ({ ...prev, [weekday]: { ...prev[weekday], end } }));
  }

  function applyTimeToAll(start: string, end: string) {
    setValues((prev) => {
      const next = { ...prev };
      for (const w of WEEKDAY_ORDER) next[w] = { ...next[w], start, end };
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const w of WEEKDAY_ORDER) {
      const v = values[w];
      fd.append(`weekly.${w}.max`, String(v.max));
      fd.append(`weekly.${w}.start`, v.start);
      fd.append(`weekly.${w}.end`, v.end);
    }
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

  const totalPerWeek = WEEKDAY_ORDER.reduce((sum, w) => sum + (values[w]?.max ?? 0), 0);

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="px-6 py-4 border-b border-stone/60 flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow eyebrow-muted">Standard-Wochenregel</div>
          <div className="text-sm text-smoke mt-1">
            Wie viele Shootings nimmst du pro Wochentag an? Optionales Zeitfenster wird als Vorschlag im Quick-Create genutzt.
          </div>
        </div>
        <BulkTimeButton onApply={applyTimeToAll} />
      </div>

      <div className="px-6 py-5">
        <ul className="divide-y divide-stone/60">
          {WEEKDAY_ORDER.map((w) => {
            const v = values[w];
            const isClosed = v.max === 0;
            return (
              <li key={w} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-24 shrink-0">
                    <div className="text-sm font-medium">{WEEKDAY_LONG[w]}</div>
                    <div className="text-xs text-smoke">{WEEKDAY_SHORT[w]}</div>
                  </div>

                  <div
                    className="flex items-center gap-1 rounded-md border px-1.5 py-1"
                    style={{
                      borderColor: isClosed ? "var(--stone)" : "rgba(120, 167, 119, 0.6)",
                      background: isClosed ? "var(--paper)" : "rgba(120, 167, 119, 0.10)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setMax(w, v.max - 1)}
                      className="w-7 h-7 rounded hover:bg-linen text-base leading-none"
                      aria-label="Weniger"
                    >−</button>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={v.max}
                      onChange={(e) => setMax(w, Number(e.target.value))}
                      className="w-10 text-center text-sm font-medium tabular-nums bg-transparent border-0 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setMax(w, v.max + 1)}
                      className="w-7 h-7 rounded hover:bg-linen text-base leading-none"
                      aria-label="Mehr"
                    >+</button>
                  </div>
                  <div className="text-xs text-smoke w-12">
                    {isClosed ? "zu" : v.max === 1 ? "1 Slot" : `${v.max} Slots`}
                  </div>

                  <div className="flex items-center gap-2 ml-auto flex-1 sm:flex-none">
                    <Clock size={13} className="text-smoke shrink-0" />
                    <input
                      type="time"
                      value={v.start}
                      onChange={(e) => setStart(w, e.target.value)}
                      disabled={isClosed}
                      className="input h-8 text-xs w-28"
                    />
                    <span className="text-xs text-smoke">bis</span>
                    <input
                      type="time"
                      value={v.end}
                      onChange={(e) => setEnd(w, e.target.value)}
                      disabled={isClosed}
                      className="input h-8 text-xs w-28"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

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

function BulkTimeButton({ onApply }: { onApply: (start: string, end: string) => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("18:00");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost text-xs h-8 shrink-0"
        title="Gleiche Uhrzeit für alle Tage übernehmen"
      >
        <Clock size={11} /> Zeitfenster für alle
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 shrink-0">
      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input h-8 text-xs w-24" />
      <span className="text-xs text-smoke">bis</span>
      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input h-8 text-xs w-24" />
      <button
        type="button"
        onClick={() => { onApply(start, end); setOpen(false); }}
        className="btn-primary text-xs h-8"
      >Übernehmen</button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs h-8">Abbrechen</button>
    </div>
  );
}

// 4-Wochen-Vorschau: zeigt sofort, wie die Wochenregel + Overrides den Kalender einfärben.
// Rein clientseitig — verwendet die gleiche Logik wie der echte Kalender.
function WeeklyPreview({ weekly, overrides }: { weekly: WeeklyRow[]; overrides: OverrideRow[] }) {
  const today = new Date();
  // Starte beim Montag dieser Woche
  const dow = today.getDay(); // 0=So
  const offsetToMonday = ((dow + 6) % 7);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetToMonday);

  const weeklyMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of weekly) m.set(w.weekday, w.maxShootings);
    return m;
  }, [weekly]);

  const overrideMap = useMemo(() => {
    const m = new Map<string, { max: number; note: string | null }>();
    for (const o of overrides) m.set(o.date, { max: o.maxShootings, note: o.note });
    return m;
  }, [overrides]);

  const days = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const ymd = `${y}-${mo}-${da}`;
      const o = overrideMap.get(ymd);
      const max = o ? o.max : (weeklyMap.get(d.getDay()) ?? 0);
      return { date: d, ymd, max, isOverride: !!o, note: o?.note ?? null };
    });
  }, [start, weeklyMap, overrideMap]);

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-stone/60">
        <div className="eyebrow eyebrow-muted">Vorschau · nächste 4 Wochen</div>
        <div className="text-xs text-smoke mt-1">
          So sieht dein Kalender mit der aktuellen Konfiguration aus.
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-stone/60 bg-linen/40">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <div key={w} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-smoke text-center">
            {WEEKDAY_SHORT[w]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const isFirst = d.date.getDate() === 1;
          const isToday = d.date.toDateString() === today.toDateString();
          const isClosed = d.max === 0;
          const lastRow = i >= 21;
          const lastCol = i % 7 === 6;
          return (
            <div
              key={d.ymd}
              className="aspect-square p-1.5 relative"
              style={{
                background: isClosed
                  ? (d.isOverride ? "rgba(159, 135, 127, 0.12)" : "rgba(236, 235, 232, 0.5)")
                  : "rgba(120, 167, 119, 0.15)",
                borderBottom: !lastRow ? "1px solid var(--stone)" : undefined,
                borderRight: !lastCol ? "1px solid var(--stone)" : undefined,
                opacity: 1,
              }}
              title={d.note ?? undefined}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs tabular-nums"
                  style={{
                    fontWeight: isToday ? 700 : isFirst ? 600 : 400,
                    color: isClosed ? "var(--smoke)" : "var(--ink)",
                  }}
                >
                  {isFirst
                    ? d.date.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
                    : d.date.getDate()}
                </span>
                {!isClosed && (
                  <span className="text-[9px] tabular-nums font-medium" style={{ color: "rgb(70, 115, 70)" }}>
                    {d.max}
                  </span>
                )}
                {isClosed && d.isOverride && (
                  <CalendarOff size={9} className="text-taupe" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
          {override.startMinutes != null && override.endMinutes != null && (
            <span> · {minutesToHHMM(override.startMinutes)}–{minutesToHHMM(override.endMinutes)}</span>
          )}
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
  const [dateEnd, setDateEnd] = useState("");
  const [maxShootings, setMaxShootings] = useState(0);
  const [note, setNote] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const rangeDays = (() => {
    if (!date) return 0;
    const start = new Date(date);
    const end = dateEnd ? new Date(dateEnd) : start;
    if (end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  })();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("date", date);
    if (dateEnd && dateEnd !== date) fd.set("dateEnd", dateEnd);
    fd.set("maxShootings", String(maxShootings));
    fd.set("note", note);
    if (maxShootings > 0 && startTime) fd.set("startTime", startTime);
    if (maxShootings > 0 && endTime) fd.set("endTime", endTime);
    startTransition(async () => {
      try {
        await upsertOverride(fd);
        toast.success(rangeDays > 1 ? `${rangeDays} Tage gespeichert` : "Ausnahme gespeichert");
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Von *">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="input h-9 text-sm"
          />
        </Field>
        <Field label="Bis" hint="optional · für Mehrtage-Urlaub">
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            min={date || undefined}
            className="input h-9 text-sm"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Slots pro Tag" hint="0 = gesperrt">
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
      {maxShootings > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Zeitfenster ab" hint="optional · überschreibt Wochenregel">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="input h-9 text-sm"
            />
          </Field>
          <Field label="Bis">
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="input h-9 text-sm"
            />
          </Field>
        </div>
      )}
      <div className="flex justify-between items-center pt-2 border-t border-stone/60">
        <div className="text-xs text-smoke">
          {rangeDays > 1 && `Wird auf ${rangeDays} Tage angewendet`}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost text-sm" disabled={pending}>
            Abbrechen
          </button>
          <button type="submit" disabled={pending || !date} className="btn-primary text-sm">
            <Save size={12} /> {pending ? "Speichern…" : "Anlegen"}
          </button>
        </div>
      </div>
    </form>
  );
}

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
