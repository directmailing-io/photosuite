"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CalendarOff,
  Clock,
  Plus,
  X,
  Save,
  Trash2,
  Info,
  ToggleLeft,
  ToggleRight,
  Sun,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/form/Field";
import {
  parseSlotsJson,
  minutesToHHMM,
  hhmmToMinutes,
  type TimeWindow,
} from "@/lib/availability";
import {
  saveDefaultDayWindow,
  saveWeeklyRules,
  upsertOverride,
  deleteOverride,
} from "./availabilityActions";

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAY_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
// Display-Reihenfolge Mo..So, intern bleiben wir bei 0=So
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MAX_WINDOWS = 12;

export type WeeklyRow = {
  weekday: number;
  isAvailable: boolean;
  slotsJson: string | null;
};
export type OverrideRow = {
  id: string;
  date: string;
  isAvailable: boolean;
  slotsJson: string | null;
  note: string | null;
};

type Props = {
  defaultDayStartMinutes: number;
  defaultDayEndMinutes: number;
  weekly: WeeklyRow[];
  overrides: OverrideRow[];
};

export function AvailabilityManager({
  defaultDayStartMinutes,
  defaultDayEndMinutes,
  weekly,
  overrides,
}: Props) {
  return (
    <div className="space-y-4">
      <DefaultDayWindowCard
        defaultDayStartMinutes={defaultDayStartMinutes}
        defaultDayEndMinutes={defaultDayEndMinutes}
      />
      <WeeklyEditor weekly={weekly} />
      <WeeklyPreview
        weekly={weekly}
        overrides={overrides}
        defaultDayStartMinutes={defaultDayStartMinutes}
        defaultDayEndMinutes={defaultDayEndMinutes}
      />
      <OverrideEditor overrides={overrides} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A) DefaultDayWindowCard — User-Default-„ganzer Tag"-Fenster
 * ------------------------------------------------------------------ */

function DefaultDayWindowCard({
  defaultDayStartMinutes,
  defaultDayEndMinutes,
}: {
  defaultDayStartMinutes: number;
  defaultDayEndMinutes: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(minutesToHHMM(defaultDayStartMinutes));
  const [end, setEnd] = useState(minutesToHHMM(defaultDayEndMinutes));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("defaultDayStart", start);
    fd.set("defaultDayEnd", end);
    startTransition(async () => {
      try {
        await saveDefaultDayWindow(fd);
        toast.success("Standard-Tagesfenster gespeichert");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="px-6 py-4 border-b border-stone/60 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow eyebrow-muted flex items-center gap-1.5">
            <Sun size={11} /> Was bedeutet „ganzer Tag"?
          </div>
          <div className="text-sm text-smoke mt-1 max-w-xl">
            Dein Standard-Tagesfenster. Wird verwendet, wenn ein Tag verfügbar ist, aber keine konkreten Zeitfenster festgelegt sind.
          </div>
        </div>
        <div className="flex items-end gap-3 shrink-0">
          <div>
            <label className="label">Von</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="input h-9 text-sm w-28"
              required
            />
          </div>
          <div>
            <label className="label">Bis</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="input h-9 text-sm w-28"
              required
            />
          </div>
          <button type="submit" disabled={pending} className="btn-primary text-sm h-9">
            <Save size={13} /> {pending ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * B) WeeklyEditor — Wochenregel mit Zeitfenster-Listen pro Tag
 * ------------------------------------------------------------------ */

type WeeklyDayState = {
  isAvailable: boolean;
  useDefault: boolean;
  windows: TimeWindow[];
};

const QUICK_MORNING: TimeWindow = { start: 9 * 60, end: 13 * 60 };
const QUICK_AFTERNOON: TimeWindow = { start: 14 * 60, end: 18 * 60 };
const QUICK_EVENING: TimeWindow = { start: 18 * 60, end: 22 * 60 };
const QUICK_PRESETS: { key: string; label: string; range: TimeWindow }[] = [
  { key: "morning", label: "Vormittag", range: QUICK_MORNING },
  { key: "afternoon", label: "Nachmittag", range: QUICK_AFTERNOON },
  { key: "evening", label: "Abend", range: QUICK_EVENING },
];

function initialWeeklyState(weekly: WeeklyRow[]): Map<number, WeeklyDayState> {
  const m = new Map<number, WeeklyDayState>();
  for (let w = 0; w < 7; w++) {
    m.set(w, { isAvailable: false, useDefault: true, windows: [] });
  }
  for (const w of weekly) {
    const parsed = parseSlotsJson(w.slotsJson);
    if (parsed && parsed.length > 0) {
      m.set(w.weekday, {
        isAvailable: w.isAvailable,
        useDefault: false,
        windows: parsed,
      });
    } else {
      m.set(w.weekday, {
        isAvailable: w.isAvailable,
        useDefault: true,
        windows: [],
      });
    }
  }
  return m;
}

function WeeklyEditor({ weekly }: { weekly: WeeklyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Map<number, WeeklyDayState>>(() => initialWeeklyState(weekly));

  function updateDay(weekday: number, patch: Partial<WeeklyDayState>) {
    setState((prev) => {
      const next = new Map(prev);
      const cur = next.get(weekday) ?? { isAvailable: false, useDefault: true, windows: [] };
      next.set(weekday, { ...cur, ...patch });
      return next;
    });
  }

  function setWindow(weekday: number, idx: number, patch: Partial<TimeWindow>) {
    setState((prev) => {
      const next = new Map(prev);
      const cur = next.get(weekday);
      if (!cur) return prev;
      const windows = cur.windows.map((w, i) => (i === idx ? { ...w, ...patch } : w));
      next.set(weekday, { ...cur, windows });
      return next;
    });
  }

  function addWindow(weekday: number, win?: TimeWindow) {
    setState((prev) => {
      const next = new Map(prev);
      const cur = next.get(weekday);
      if (!cur) return prev;
      if (cur.windows.length >= MAX_WINDOWS) return prev;
      // Quick-Add (win explizit übergeben): doppelte vermeiden.
      // Manuelles „+ Fenster" (win = undefined): IMMER neues Fenster anlegen,
      // Default smart anhand des letzten Endpunkts plus 1h Pause.
      let candidate: TimeWindow;
      if (win) {
        if (cur.windows.some((w) => w.start === win.start && w.end === win.end)) {
          return prev;
        }
        candidate = win;
      } else {
        const lastEnd = cur.windows.length
          ? Math.max(...cur.windows.map((w) => w.end))
          : 9 * 60;
        const start = Math.min(22 * 60, lastEnd + 60);
        const end = Math.min(23 * 60, start + 3 * 60);
        candidate = end > start ? { start, end } : { start: 10 * 60, end: 14 * 60 };
      }
      next.set(weekday, {
        ...cur,
        useDefault: false,
        windows: [...cur.windows, candidate],
      });
      return next;
    });
  }

  function removeWindow(weekday: number, idx: number) {
    setState((prev) => {
      const next = new Map(prev);
      const cur = next.get(weekday);
      if (!cur) return prev;
      next.set(weekday, { ...cur, windows: cur.windows.filter((_, i) => i !== idx) });
      return next;
    });
  }

  // Kopiert die Konfiguration eines Tages auf alle anderen Tage (außer So) —
  // klassische „Mo-Fr gleich"-Geste. Vorhandene Werte werden überschrieben.
  function copyToWeekdays(fromWeekday: number) {
    setState((prev) => {
      const src = prev.get(fromWeekday);
      if (!src) return prev;
      const next = new Map(prev);
      // Mo..Fr (1..5) als „Werktage" — kann auf den Quell-Tag selbst keine Wirkung haben.
      for (let w = 1; w <= 5; w++) {
        if (w === fromWeekday) continue;
        next.set(w, {
          isAvailable: src.isAvailable,
          useDefault: src.useDefault,
          windows: src.windows.map((win) => ({ ...win })),
        });
      }
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (let w = 0; w < 7; w++) {
      const day = state.get(w);
      if (!day) continue;
      if (day.isAvailable) fd.set(`weekly.${w}.available`, "on");
      if (day.useDefault || day.windows.length === 0) {
        fd.set(`weekly.${w}.useDefault`, "on");
      } else {
        day.windows.forEach((win, i) => {
          fd.set(`weekly.${w}.slots.${i}.start`, minutesToHHMM(win.start));
          fd.set(`weekly.${w}.slots.${i}.end`, minutesToHHMM(win.end));
        });
      }
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

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="px-6 py-4 border-b border-stone/60">
        <div className="eyebrow eyebrow-muted">Standard-Wochenregel</div>
        <div className="text-sm text-smoke mt-1">
          Für jeden Wochentag: Verfügbar oder nicht — und optional konkrete Zeitfenster.
        </div>
      </div>

      <div className="px-6 py-5">
        <ul className="space-y-2">
          {WEEKDAY_ORDER.map((w) => {
            const day = state.get(w) ?? { isAvailable: false, useDefault: true, windows: [] };
            return (
              <li key={w}>
                <WeeklyDayRow
                  weekday={w}
                  state={day}
                  onToggleAvailable={() => updateDay(w, { isAvailable: !day.isAvailable })}
                  onSetMode={(useDefault) => updateDay(w, { useDefault })}
                  onSetWindow={(i, patch) => setWindow(w, i, patch)}
                  onAddWindow={(win) => addWindow(w, win)}
                  onRemoveWindow={(i) => removeWindow(w, i)}
                  onCopyToWeekdays={() => copyToWeekdays(w)}
                />
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center justify-between pt-4 border-t border-stone/60">
          <div className="text-xs text-smoke flex items-center gap-1.5">
            <Info size={12} /> „Ganzer Tag" nutzt dein Standard-Tagesfenster oben.
          </div>
          <button type="submit" disabled={pending} className="btn-primary text-sm">
            <Save size={13} /> {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </form>
  );
}

function WeeklyDayRow({
  weekday,
  state,
  onToggleAvailable,
  onSetMode,
  onSetWindow,
  onAddWindow,
  onRemoveWindow,
  onCopyToWeekdays,
}: {
  weekday: number;
  state: WeeklyDayState;
  onToggleAvailable: () => void;
  onSetMode: (useDefault: boolean) => void;
  onSetWindow: (idx: number, patch: Partial<TimeWindow>) => void;
  onAddWindow: (win?: TimeWindow) => void;
  onRemoveWindow: (idx: number) => void;
  onCopyToWeekdays: () => void;
}) {
  const sortedIdx = useMemo(() => {
    return state.windows
      .map((w, i) => ({ w, i }))
      .sort((a, b) => a.w.start - b.w.start)
      .map((x) => x.i);
  }, [state.windows]);

  const isWorkday = weekday >= 1 && weekday <= 5;
  // Total-Minuten: bei useDefault nutzen wir Platzhalter „—" (echte Berechnung
  // bräuchte die props.defaultDayStart/End, hier dezente Anzeige reicht).
  const totalMin = state.useDefault ? null : totalMinutes(state.windows);

  // Card-Background: subtil hervorheben je nach Zustand
  const cardBg = state.isAvailable
    ? "rgba(120, 167, 119, 0.05)"
    : "var(--paper)";
  const cardBorder = state.isAvailable
    ? "rgba(120, 167, 119, 0.35)"
    : "var(--stone)";

  return (
    <div
      className="rounded-xl border transition-all"
      style={{ background: cardBg, borderColor: cardBorder }}
    >
      {/* Header: immer sichtbar, kompakt */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-20 shrink-0">
          <div className="text-sm font-medium leading-tight">{WEEKDAY_LONG[weekday]}</div>
          <div className="text-[10px] uppercase tracking-wider text-smoke">{WEEKDAY_SHORT[weekday]}</div>
        </div>

        <ToggleButton
          checked={state.isAvailable}
          onChange={onToggleAvailable}
          label={state.isAvailable ? "Verfügbar" : "Nicht verfügbar"}
        />

        {state.isAvailable && (
          <div className="ml-auto flex items-center gap-3">
            {totalMin !== null && totalMin > 0 && (
              <div className="text-xs tabular-nums" style={{ color: "rgb(70, 115, 70)" }}>
                {formatHoursShort(totalMin)}
              </div>
            )}
            {state.useDefault && (
              <div className="text-xs text-smoke italic">ganzer Tag</div>
            )}
            {isWorkday && (
              <button
                type="button"
                onClick={onCopyToWeekdays}
                className="text-[10px] uppercase tracking-wider text-smoke hover:text-ink transition-colors flex items-center gap-1"
                title="Diese Einstellung auf Mo–Fr übernehmen"
              >
                <Copy size={9} /> Mo–Fr
              </button>
            )}
          </div>
        )}
      </div>

      {/* Wenn verfügbar: Quick-Adds + Timeline + ggf. Window-Liste */}
      {state.isAvailable && (
        <div className="px-4 pb-4 space-y-3">
          {/* Quick-Add-Buttons als zentrale Aktion */}
          <div className="flex flex-wrap gap-1.5">
            <QuickPresetButton
              active={state.useDefault}
              icon={<Sun size={11} />}
              label="Ganzer Tag"
              onClick={() => onSetMode(true)}
            />
            {QUICK_PRESETS.map((p) => {
              const present = !state.useDefault && state.windows.some(
                (w) => w.start === p.range.start && w.end === p.range.end,
              );
              return (
                <QuickPresetButton
                  key={p.key}
                  active={present}
                  icon={<Plus size={11} />}
                  label={`${p.label} ${minutesToHHMM(p.range.start)}–${minutesToHHMM(p.range.end)}`}
                  onClick={() => onAddWindow(p.range)}
                />
              );
            })}
            {!state.useDefault && state.windows.length < MAX_WINDOWS && (
              <QuickPresetButton
                active={false}
                icon={<Clock size={11} />}
                label="Eigenes Fenster"
                onClick={() => onAddWindow()}
              />
            )}
          </div>

          {/* Window-Cards: nur wenn eigene Fenster */}
          {!state.useDefault && state.windows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sortedIdx.map((i) => {
                const w = state.windows[i];
                return (
                  <WindowCard
                    key={i}
                    window={w}
                    onSet={(patch) => onSetWindow(i, patch)}
                    onRemove={() => onRemoveWindow(i)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Total in Min → kompaktes Label „4h 30min" / „6h" / „45min"
function formatHoursShort(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function QuickPresetButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all"
      style={{
        borderColor: active ? "rgb(70, 115, 70)" : "var(--stone)",
        background: active ? "rgb(70, 115, 70)" : "var(--paper)",
        color: active ? "#fff" : "var(--smoke)",
      }}
    >
      {icon} {label}
    </button>
  );
}

// Kompakte Window-Card: Zeit-Inputs nebeneinander, X oben rechts
function WindowCard({
  window: w,
  onSet,
  onRemove,
}: {
  window: TimeWindow;
  onSet: (patch: Partial<TimeWindow>) => void;
  onRemove: () => void;
}) {
  const duration = w.end - w.start;
  return (
    <div
      className="relative rounded-lg border bg-paper px-3 py-2 flex items-center gap-2 shadow-sm"
      style={{ borderColor: "var(--stone)" }}
    >
      <input
        type="time"
        value={minutesToHHMM(w.start)}
        onChange={(e) => {
          const v = hhmmToMinutes(e.target.value);
          if (v != null) onSet({ start: v });
        }}
        className="bg-transparent text-sm tabular-nums font-medium w-16 border-0 focus:outline-none focus:ring-0 p-0"
      />
      <span className="text-xs text-smoke">–</span>
      <input
        type="time"
        value={minutesToHHMM(w.end)}
        onChange={(e) => {
          const v = hhmmToMinutes(e.target.value);
          if (v != null) onSet({ end: v });
        }}
        className="bg-transparent text-sm tabular-nums font-medium w-16 border-0 focus:outline-none focus:ring-0 p-0"
      />
      <span className="text-[10px] text-smoke tabular-nums ml-1">
        {duration > 0 ? formatHoursShort(duration) : ""}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded-full hover:bg-linen p-0.5 transition-colors"
        title="Fenster entfernen"
        aria-label="Fenster entfernen"
      >
        <X size={12} className="text-smoke" />
      </button>
    </div>
  );
}

function ToggleButton({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: checked ? "rgba(120, 167, 119, 0.6)" : "var(--stone)",
        background: checked ? "rgba(120, 167, 119, 0.12)" : "var(--paper)",
        color: checked ? "rgb(70, 115, 70)" : "var(--smoke)",
      }}
      aria-pressed={checked}
    >
      {checked ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
      {label}
    </button>
  );
}

function ModeChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
      style={{
        borderColor: active ? "var(--ink)" : "var(--stone)",
        background: active ? "var(--ink)" : "var(--paper)",
        color: active ? "var(--linen)" : "var(--smoke)",
      }}
      aria-pressed={active}
    >
      {icon} {label}
    </button>
  );
}

function WindowList({
  windows,
  order,
  onSet,
  onRemove,
  onAdd,
  canAdd,
}: {
  windows: TimeWindow[];
  order: number[];
  onSet: (idx: number, patch: Partial<TimeWindow>) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {windows.length === 0 && (
        <div className="text-xs text-smoke italic">
          Noch keine Zeitfenster. Füge eines hinzu oder nutze einen Schnell-Button unten.
        </div>
      )}
      {order.map((i) => {
        const w = windows[i];
        return (
          <div key={i} className="flex items-center gap-2">
            <Clock size={13} className="text-smoke shrink-0" />
            <input
              type="time"
              value={minutesToHHMM(w.start)}
              onChange={(e) => {
                const v = hhmmToMinutes(e.target.value);
                if (v != null) onSet(i, { start: v });
              }}
              className="input h-9 text-sm w-28"
            />
            <span className="text-xs text-smoke">bis</span>
            <input
              type="time"
              value={minutesToHHMM(w.end)}
              onChange={(e) => {
                const v = hhmmToMinutes(e.target.value);
                if (v != null) onSet(i, { end: v });
              }}
              className="input h-9 text-sm w-28"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="btn-icon"
              style={{ color: "var(--accent)" }}
              title="Fenster entfernen"
              aria-label="Fenster entfernen"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="btn-ghost text-xs h-8 mt-1"
        >
          <Plus size={12} /> Fenster
        </button>
      )}
    </div>
  );
}

function QuickWindowChip({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] rounded-full border border-stone/70 bg-paper px-2 py-0.5 text-smoke hover:text-ink hover:border-ink/40 transition-colors flex items-center gap-1"
    >
      <Plus size={10} /> {label}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * C) WeeklyPreview — 4-Wochen-Vorschau mit effektiven Fenstern
 * ------------------------------------------------------------------ */

function totalMinutes(windows: TimeWindow[]): number {
  return windows.reduce((sum, w) => sum + Math.max(0, w.end - w.start), 0);
}

function WeeklyPreview({
  weekly,
  overrides,
  defaultDayStartMinutes,
  defaultDayEndMinutes,
}: {
  weekly: WeeklyRow[];
  overrides: OverrideRow[];
  defaultDayStartMinutes: number;
  defaultDayEndMinutes: number;
}) {
  const today = new Date();
  const dow = today.getDay(); // 0=So
  const offsetToMonday = (dow + 6) % 7;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetToMonday);

  const userDefault: TimeWindow = useMemo(
    () => ({ start: defaultDayStartMinutes, end: defaultDayEndMinutes }),
    [defaultDayStartMinutes, defaultDayEndMinutes],
  );

  const weeklyMap = useMemo(() => {
    const m = new Map<number, { isAvailable: boolean; windows: TimeWindow[] }>();
    for (const w of weekly) {
      const parsed = parseSlotsJson(w.slotsJson);
      const windows = w.isAvailable
        ? parsed && parsed.length > 0
          ? parsed
          : [userDefault]
        : [];
      m.set(w.weekday, { isAvailable: w.isAvailable, windows });
    }
    return m;
  }, [weekly, userDefault]);

  const overrideMap = useMemo(() => {
    const m = new Map<string, { isAvailable: boolean; windows: TimeWindow[]; note: string | null }>();
    for (const o of overrides) {
      const parsed = parseSlotsJson(o.slotsJson);
      const windows = o.isAvailable
        ? parsed && parsed.length > 0
          ? parsed
          : [userDefault]
        : [];
      m.set(o.date, { isAvailable: o.isAvailable, windows, note: o.note });
    }
    return m;
  }, [overrides, userDefault]);

  const days = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const ymd = `${y}-${mo}-${da}`;
      const o = overrideMap.get(ymd);
      const wk = weeklyMap.get(d.getDay());
      const eff = o ?? wk ?? { isAvailable: false, windows: [] as TimeWindow[] };
      const minutes = totalMinutes(eff.windows);
      return {
        date: d,
        ymd,
        isAvailable: eff.isAvailable && minutes > 0,
        isOverride: !!o,
        note: o?.note ?? null,
        minutes,
      };
    });
  }, [start, weeklyMap, overrideMap]);

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-stone/60">
        <div className="eyebrow eyebrow-muted flex items-center gap-1.5">
          <Calendar size={11} /> Vorschau · nächste 4 Wochen
        </div>
        <div className="text-xs text-smoke mt-1">
          So sieht dein Kalender mit der aktuellen Konfiguration aus. Stunden = verfügbares Tagesfenster.
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-stone/60 bg-linen/40">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <div
            key={w}
            className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-smoke text-center"
          >
            {WEEKDAY_SHORT[w]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const isFirst = d.date.getDate() === 1;
          const isToday = d.date.toDateString() === today.toDateString();
          const lastRow = i >= 21;
          const lastCol = i % 7 === 6;
          const hours = d.minutes / 60;
          const hoursLabel = hours >= 10
            ? `${Math.round(hours)}h`
            : `${hours.toFixed(1).replace(/\.0$/, "")}h`;

          let bg = "rgba(236, 235, 232, 0.5)"; // grey: nicht verfügbar
          if (d.isAvailable) bg = "rgba(120, 167, 119, 0.15)"; // green: verfügbar
          if (d.isOverride && !d.isAvailable) bg = "rgba(159, 135, 127, 0.12)"; // accent-soft (gesperrter Override)
          if (d.isOverride && d.isAvailable) bg = "rgba(159, 135, 127, 0.18)"; // accent-soft (verfügbarer Override)

          return (
            <div
              key={d.ymd}
              className="aspect-square p-1.5 relative"
              style={{
                background: bg,
                borderBottom: !lastRow ? "1px solid var(--stone)" : undefined,
                borderRight: !lastCol ? "1px solid var(--stone)" : undefined,
              }}
              title={d.note ?? undefined}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs tabular-nums"
                  style={{
                    fontWeight: isToday ? 700 : isFirst ? 600 : 400,
                    color: d.isAvailable ? "var(--ink)" : "var(--smoke)",
                  }}
                >
                  {isFirst
                    ? d.date.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
                    : d.date.getDate()}
                </span>
                {d.isAvailable && (
                  <span
                    className="text-[9px] tabular-nums font-medium"
                    style={{ color: "rgb(70, 115, 70)" }}
                  >
                    {hoursLabel}
                  </span>
                )}
                {!d.isAvailable && d.isOverride && (
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

/* ------------------------------------------------------------------ *
 * D) OverrideEditor — Ausnahmen
 * ------------------------------------------------------------------ */

function OverrideEditor({ overrides }: { overrides: OverrideRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  const upcoming = overrides.filter((o) => o.date >= todayYmd);
  const past = overrides.filter((o) => o.date < todayYmd);

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
        <div>
          <div className="eyebrow eyebrow-muted">Ausnahmen</div>
          <div className="text-sm text-smoke mt-1">
            Urlaub, Feiertage, Sondertage — überschreiben die Wochenregel.
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
            onSaved={() => {
              setAdding(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {upcoming.length === 0 && !adding ? (
        <div className="px-6 py-10 text-center text-sm text-smoke">
          Keine geplanten Ausnahmen.
        </div>
      ) : (
        <ul className="divide-y divide-stone/60">
          {upcoming.map((o) => (
            <OverrideRowView key={o.id} override={o} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="px-6 py-3 border-t border-stone/60 text-sm">
          <summary className="cursor-pointer text-smoke hover:text-ink">
            Vergangene Ausnahmen ({past.length})
          </summary>
          <ul className="mt-3 space-y-1">
            {past.map((o) => (
              <li
                key={o.id}
                className="text-xs text-smoke flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  {formatYmd(o.date)} — {summarizeOverride(o)}
                  {o.note && ` (${o.note})`}
                </span>
                <DeleteOverrideButton id={o.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function summarizeOverride(o: OverrideRow): string {
  if (!o.isAvailable) return "gesperrt";
  const parsed = parseSlotsJson(o.slotsJson);
  if (!parsed || parsed.length === 0) return "verfügbar (ganzer Tag)";
  const txt = parsed
    .map((w) => `${minutesToHHMM(w.start)}–${minutesToHHMM(w.end)}`)
    .join(", ");
  return `verfügbar · ${txt}`;
}

function OverrideRowView({ override }: { override: OverrideRow }) {
  const parsed = parseSlotsJson(override.slotsJson);
  const hasCustomWindows = override.isAvailable && parsed && parsed.length > 0;
  const isBlocked = !override.isAvailable;

  return (
    <li className="px-6 py-3 flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: isBlocked ? "var(--linen)" : "rgba(120, 167, 119, 0.15)",
          color: isBlocked ? "var(--smoke)" : "rgb(80, 130, 80)",
        }}
      >
        {isBlocked ? <CalendarOff size={16} /> : <Calendar size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{formatYmd(override.date)}</div>
        <div className="text-xs text-smoke mt-0.5">
          {isBlocked ? (
            <span>Gesperrt</span>
          ) : hasCustomWindows ? (
            <span>
              Verfügbar — Fenster:{" "}
              {parsed!
                .map((w) => `${minutesToHHMM(w.start)}–${minutesToHHMM(w.end)}`)
                .join(", ")}
            </span>
          ) : (
            <span>Verfügbar — ganzer Tag</span>
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
    <button
      onClick={onClick}
      disabled={pending}
      className="btn-icon"
      style={{ color: "var(--accent)" }}
      title="Entfernen"
    >
      <Trash2 size={13} />
    </button>
  );
}

function OverrideForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);
  const [useDefault, setUseDefault] = useState(true);
  const [windows, setWindows] = useState<TimeWindow[]>([]);
  const [note, setNote] = useState("");

  const rangeDays = (() => {
    if (!date) return 0;
    const start = new Date(date);
    const end = dateEnd ? new Date(dateEnd) : start;
    if (end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  })();

  const sortedIdx = useMemo(() => {
    return windows
      .map((w, i) => ({ w, i }))
      .sort((a, b) => a.w.start - b.w.start)
      .map((x) => x.i);
  }, [windows]);

  function setWindow(idx: number, patch: Partial<TimeWindow>) {
    setWindows((prev) => prev.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  }

  function addWindow(win?: TimeWindow) {
    setWindows((prev) => {
      if (prev.length >= MAX_WINDOWS) return prev;
      const candidate = win ?? { start: 10 * 60, end: 14 * 60 };
      if (prev.some((w) => w.start === candidate.start && w.end === candidate.end)) return prev;
      return [...prev, candidate];
    });
    setUseDefault(false);
  }

  function removeWindow(idx: number) {
    setWindows((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("date", date);
    if (dateEnd && dateEnd !== date) fd.set("dateEnd", dateEnd);
    if (isAvailable) fd.set("isAvailable", "on");
    fd.set("note", note);
    if (isAvailable) {
      if (useDefault || windows.length === 0) {
        fd.set("useDefault", "on");
      } else {
        windows.forEach((win, i) => {
          fd.set(`slots.${i}.start`, minutesToHHMM(win.start));
          fd.set(`slots.${i}.end`, minutesToHHMM(win.end));
        });
      }
    }
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

      <div className="flex items-center gap-3 flex-wrap">
        <ToggleButton
          checked={isAvailable}
          onChange={() => setIsAvailable((v) => !v)}
          label={isAvailable ? "Verfügbar" : "Gesperrt"}
        />
        {isAvailable && (
          <div className="flex items-center gap-1">
            <ModeChip
              active={useDefault}
              onClick={() => setUseDefault(true)}
              icon={<Sun size={11} />}
              label="Ganzer Tag"
            />
            <ModeChip
              active={!useDefault}
              onClick={() => setUseDefault(false)}
              icon={<Clock size={11} />}
              label="Eigene Zeitfenster"
            />
          </div>
        )}
      </div>

      {isAvailable && !useDefault && (
        <div>
          <WindowList
            windows={windows}
            order={sortedIdx}
            onSet={setWindow}
            onRemove={removeWindow}
            onAdd={() => addWindow()}
            canAdd={windows.length < MAX_WINDOWS}
          />
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-smoke mr-1">Schnell:</span>
            <QuickWindowChip
              onClick={() => addWindow(QUICK_MORNING)}
              label="Vormittag 09:00–13:00"
            />
            <QuickWindowChip
              onClick={() => addWindow(QUICK_AFTERNOON)}
              label="Nachmittag 14:00–18:00"
            />
          </div>
        </div>
      )}

      <Field label="Notiz" hint="optional · z.B. Urlaub, Feiertag">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Urlaub, Feiertag …"
          className="input h-9 text-sm"
        />
      </Field>

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
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
