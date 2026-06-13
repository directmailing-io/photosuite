"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, DragOverlay,
} from "@dnd-kit/core";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin,
  X, ExternalLink, User, Package as PackageIcon, Euro, Plus, Save, Mail, Video,
  Sparkles, AlertTriangle, CalendarOff, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatEUR } from "@/lib/utils";
import { Field, FormRow } from "@/components/form/Field";
import { moveShootingToDate, createShooting } from "./actions";
import { acceptBooking, cancelBooking } from "../buchungen/actions";
import { setDayAvailability } from "../einstellungen/availabilityActions";
import {
  findStartTimesInDay, minutesToHHMM, hhmmToMinutes,
  type TimeWindow,
} from "@/lib/availability";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export type CalendarShooting = {
  id: string;
  title: string;
  scheduledAt: string;          // ISO
  durationMin: number | null;
  location: string | null;
  price: number;
  customerId: string;
  customerFirstName: string;
  customerLastName: string;
  customerAvatarUrl: string | null;
  statusLabel: string | null;
  statusColor: string | null;
  packageName: string | null;
};

export type CalendarCustomer = { id: string; firstName: string; lastName: string };
export type CalendarPackage = {
  id: string;
  name: string;
  price: number;
  durationMin: number | null;
  bookingBufferBeforeMin?: number | null;
  bookingBufferAfterMin?: number | null;
};

export type ExternalEvent = {
  id: string;
  startAt: string;
  endAt: string;
  summary: string | null;
  provider: string;
};

// Online-Buchung (Calendly-Style) — noch nicht zu Shooting transformiert.
// Wird im Kalender als eigene Tile mit grünem Akzent dargestellt.
export type CalendarBooking = {
  id: string;
  customerName: string;
  customerEmail: string;
  startAt: string;     // ISO
  endAt: string;
  status: "PENDING" | "CONFIRMED";
  bookingTypeName: string;
  bookingTypeColor: string;
  meetingUrl: string | null;
  meetingProvider: string | null;
};

// Spiegelt DayStatus aus lib/availability — als serialisierbarer Plain-Object.
export type AvailabilityDay = {
  date: string;          // YYYY-MM-DD
  weekday: number;
  isAvailable: boolean;
  windows: TimeWindow[];      // Gesamte Tagesfenster (offene Zeiten)
  busyWindows: TimeWindow[];  // Belegt durch Shootings + Paket-Buffer
  freeWindows: TimeWindow[];  // windows minus busyWindows
  freeMinutes: number;
  isOverride: boolean;
  note: string | null;
  overrideId: string | null;
};

type Props = {
  shootings: CalendarShooting[];
  externalEvents: ExternalEvent[];
  bookings?: CalendarBooking[];
  year: number;
  month: number;
  customers: CalendarCustomer[];
  packages: CalendarPackage[];
  availability: AvailabilityDay[];
  nextFreeDays: AvailabilityDay[];
  // Wo soll die Navigation hin? "/kalender" (eigene Route) oder "/shootings?view=calendar".
  basePath?: string;
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return ymd(a) === ymd(b);
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = (month - 1) + delta;
  const newYear = year + Math.floor(idx / 12);
  const newMonth = ((idx % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth };
}

export function CalendarView({ shootings: initialShootings, externalEvents, bookings = [], year, month, customers, packages, availability, nextFreeDays, basePath = "/shootings?view=calendar" }: Props) {
  const router = useRouter();
  const [shootings, setShootings] = useState(initialShootings);
  const [selected, setSelected] = useState<CalendarShooting | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
  const [createForDate, setCreateForDate] = useState<string | null>(null); // YYYY-MM-DD
  const [editAvailabilityFor, setEditAvailabilityFor] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<CalendarShooting | null>(null);
  const [showOnlyFree, setShowOnlyFree] = useState(false);
  const [, startTransition] = useTransition();

  // Verfügbarkeit pro Tag indexieren (für O(1)-Lookup im Grid)
  const availabilityByDay = useMemo(() => {
    const map = new Map<string, AvailabilityDay>();
    for (const d of availability) map.set(d.date, d);
    return map;
  }, [availability]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const days = useMemo(() => {
    const firstOfMonth = new Date(year, month - 1, 1);
    const startWeekdayMonBased = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month - 1, 1 - startWeekdayMonBased);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarShooting[]>();
    for (const s of shootings) {
      const key = ymd(new Date(s.scheduledAt));
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return map;
  }, [shootings]);

  // Externe Events nach Tag indexiert
  const externalByDay = useMemo(() => {
    const map = new Map<string, ExternalEvent[]>();
    for (const e of externalEvents) {
      const key = ymd(new Date(e.startAt));
      const arr = map.get(key);
      if (arr) arr.push(e);
      else map.set(key, [e]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return map;
  }, [externalEvents]);

  // Online-Buchungen nach Tag indexiert
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      const key = ymd(new Date(b.startAt));
      const arr = map.get(key);
      if (arr) arr.push(b);
      else map.set(key, [b]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return map;
  }, [bookings]);

  const today = new Date();
  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, +1);
  const todayParam = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayInThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const s = shootings.find((x) => x.id === id);
    if (s) setActiveDrag(s);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    if (!e.over) return;
    const shootingId = String(e.active.id);
    const targetDate = String(e.over.id); // YYYY-MM-DD

    const sh = shootings.find((x) => x.id === shootingId);
    if (!sh) return;
    const currentDate = ymd(new Date(sh.scheduledAt));
    if (currentDate === targetDate) return;

    // Verfügbarkeits-Check vor dem Verschieben — bei vollem/gesperrtem Tag nachfragen.
    const target = availabilityByDay.get(targetDate);
    if (target) {
      if (!target.isAvailable) {
        const proceed = confirm(
          `Dieser Tag ist nicht verfügbar${target.note ? ` (${target.note})` : ""}.\n\nTrotzdem verschieben?`,
        );
        if (!proceed) return;
      } else if (target.freeMinutes === 0) {
        const proceed = confirm(
          `Dieser Tag ist bereits voll belegt.\n\nTrotzdem verschieben (überbuchen)?`,
        );
        if (!proceed) return;
      }
    }

    // Optimistic Update: lokales Datum aktualisieren (Uhrzeit behalten)
    const original = new Date(sh.scheduledAt);
    const [y, m, d] = targetDate.split("-").map(Number);
    const newDate = new Date(y, m - 1, d, original.getHours(), original.getMinutes());
    setShootings((prev) => prev.map((x) => x.id === shootingId ? { ...x, scheduledAt: newDate.toISOString() } : x));

    startTransition(async () => {
      try {
        await moveShootingToDate(shootingId, targetDate);
        toast.success(`Verschoben auf ${newDate.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}`);
        router.refresh();
      } catch (err: any) {
        // Rollback
        setShootings((prev) => prev.map((x) => x.id === shootingId ? sh : x));
        toast.error(err?.message ?? "Konnte nicht verschieben");
      }
    });
  }

  return (
    <>
      <div className="card overflow-hidden">
        {/* Monats-Navigation */}
        <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-stone/60">
          <div className="flex items-center gap-1">
            <CalendarLink basePath={basePath} year={prev.year} month={prev.month} label="Voriger Monat" icon={<ChevronLeft size={16} />} />
            <CalendarLink basePath={basePath} year={next.year} month={next.month} label="Nächster Monat" icon={<ChevronRight size={16} />} />
          </div>
          <div className="text-center">
            <div className="font-serif text-xl">{MONTHS[month - 1]} {year}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOnlyFree((v) => !v)}
              className="btn-secondary text-xs h-9"
              style={{
                borderColor: showOnlyFree ? "var(--accent)" : undefined,
                color: showOnlyFree ? "var(--accent)" : undefined,
              }}
              title="Nur Tage mit freien Slots hervorheben"
            >
              <Sparkles size={13} /> Nur freie
            </button>
            {!todayInThisMonth && (
              <Link href={`${basePath}${basePath.includes("?") ? "&" : "?"}month=${todayParam}`} className="btn-secondary text-xs h-9">
                <CalendarIcon size={13} /> Heute
              </Link>
            )}
          </div>
        </div>

        {/* Wochentags-Header */}
        <div className="grid grid-cols-7 border-b border-stone/60 bg-linen/50">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className="px-3 py-2 text-[10px] uppercase tracking-wider text-smoke text-center"
              style={{ color: i >= 5 ? "var(--taupe)" : undefined }}
            >
              {w}
            </div>
          ))}
        </div>

        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const inMonth = d.getMonth() + 1 === month;
              const isToday = isSameDay(d, today);
              const isWeekend = (d.getDay() + 6) % 7 >= 5;
              const dayKey = ymd(d);
              const dayShootings = byDay.get(dayKey) ?? [];
              const dayExternal = externalByDay.get(dayKey) ?? [];
              const dayBookings = bookingsByDay.get(dayKey) ?? [];
              const isLastRow = i >= 35;
              const isLastCol = i % 7 === 6;
              const dayAvailability = availabilityByDay.get(dayKey) ?? null;
              return (
                <DayCell
                  key={i}
                  date={d}
                  dayKey={dayKey}
                  inMonth={inMonth}
                  isToday={isToday}
                  isWeekend={isWeekend}
                  isLastRow={isLastRow}
                  isLastCol={isLastCol}
                  shootings={dayShootings}
                  externalEvents={dayExternal}
                  bookings={dayBookings}
                  availability={dayAvailability}
                  dimNonFree={showOnlyFree}
                  onSelect={(s) => setSelected(s)}
                  onSelectBooking={(b) => setSelectedBooking(b)}
                  onCreate={() => setCreateForDate(dayKey)}
                  onEditAvailability={() => setEditAvailabilityFor(dayKey)}
                />
              );
            })}
          </div>

          {/* Drag-Overlay: das Tile folgt der Maus weich */}
          <DragOverlay>
            {activeDrag ? <ShootingTile shooting={activeDrag} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {selected && (
        <ShootingModal
          shooting={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}

      {createForDate && (
        <QuickCreateModal
          isoDate={createForDate}
          customers={customers}
          packages={packages}
          existingShootings={byDay.get(createForDate) ?? []}
          availability={availabilityByDay.get(createForDate) ?? null}
          quickPicks={nextFreeDays.slice(0, 3).filter((d) => d.date !== createForDate)}
          onSwitchDate={(ymd) => setCreateForDate(ymd)}
          onClose={() => setCreateForDate(null)}
        />
      )}

      <FreeSlotsPanel nextFreeDays={nextFreeDays} onPick={(ymd) => setCreateForDate(ymd)} />

      {editAvailabilityFor && (
        <AvailabilityPopover
          isoDate={editAvailabilityFor}
          availability={availabilityByDay.get(editAvailabilityFor) ?? null}
          onClose={() => setEditAvailabilityFor(null)}
        />
      )}
    </>
  );
}

// Inline-Popover für Tag-Verfügbarkeit — Lisa klickt im Kalender auf einen Tag und
// markiert ihn als verfügbar/unverfügbar (mit optionalen Zeitfenstern).
// Schreibt einen AvailabilityOverride.
function AvailabilityPopover({
  isoDate, availability, onClose,
}: {
  isoDate: string;
  availability: AvailabilityDay | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isAvailable, setIsAvailable] = useState<boolean>(availability?.isAvailable ?? true);
  // useDefault=true → User-Default-Tagesfenster, useDefault=false → eigene Zeitfenster.
  // Heuristik: wenn der Tag ein Override mit eigenen Fenstern hat → eigene Fenster.
  // Wenn keine Fenster (oder kein Override) → useDefault.
  const initialUseDefault =
    !availability
      ? true
      : !availability.isAvailable
        ? true
        : !availability.isOverride
          ? true
          : availability.windows.length === 0
            ? true
            : false;
  const [useDefault, setUseDefault] = useState<boolean>(initialUseDefault);
  const [windows, setWindows] = useState<TimeWindow[]>(() => {
    if (!availability || !availability.isAvailable) return [];
    if (availability.windows.length > 0 && availability.isOverride) {
      return availability.windows.map((w) => ({ start: w.start, end: w.end }));
    }
    return [];
  });
  const [note, setNote] = useState(availability?.note ?? "");

  const dateLabel = new Date(isoDate + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  function addWindow() {
    setWindows((prev) => {
      if (prev.length >= 6) return prev;
      const last = prev[prev.length - 1];
      const newStart = last ? Math.min(last.end, 22 * 60) : 9 * 60;
      const newEnd = Math.min(newStart + 120, 23 * 60);
      return [...prev, { start: newStart, end: newEnd }];
    });
  }

  function removeWindow(i: number) {
    setWindows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateWindow(i: number, key: "start" | "end", hhmm: string) {
    const mins = hhmmToMinutes(hhmm);
    if (mins == null) return;
    setWindows((prev) => prev.map((w, idx) => idx === i ? { ...w, [key]: mins } : w));
  }

  function quickAdd(start: number, end: number) {
    setWindows((prev) => {
      // duplikate vermeiden
      if (prev.some((w) => w.start === start && w.end === end)) return prev;
      return [...prev, { start, end }].sort((a, b) => a.start - b.start);
    });
  }

  function save() {
    // Validierung: alle Fenster start<end
    if (isAvailable && !useDefault) {
      for (const w of windows) {
        if (w.end <= w.start) {
          toast.error("Endzeit muss nach der Startzeit liegen");
          return;
        }
      }
    }
    startTransition(async () => {
      try {
        await setDayAvailability(isoDate, {
          isAvailable,
          windows: !isAvailable
            ? null
            : useDefault
              ? null
              : windows,
          note: note.trim() || null,
        });
        toast.success("Verfügbarkeit gespeichert");
        router.refresh();
        onClose();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  function resetToWeekly() {
    startTransition(async () => {
      try {
        await setDayAvailability(isoDate, { unset: true });
        toast.success("Auf Wochenregel zurückgesetzt");
        router.refresh();
        onClose();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5" style={{ background: isAvailable ? "rgb(120, 167, 119)" : "var(--taupe)" }} />
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow eyebrow-muted">Verfügbarkeit</div>
              <div className="font-serif text-lg mt-0.5">{dateLabel}</div>
              <div className="text-xs text-smoke mt-1">
                {availability?.isOverride
                  ? "Überschreibt die Wochenregel"
                  : "Wochenregel — Änderung speichert als Ausnahme"}
              </div>
            </div>
            <button type="button" onClick={onClose} className="btn-icon shrink-0" aria-label="Schließen">
              <X size={15} />
            </button>
          </div>

          {/* Verfügbar-Toggle */}
          <div
            className="flex items-center justify-between gap-3 p-3 rounded-lg border"
            style={{
              borderColor: "var(--stone)",
              background: isAvailable ? "rgba(120, 167, 119, 0.10)" : "var(--linen)",
            }}
          >
            <div>
              <div className="text-sm font-medium">
                {isAvailable ? "Verfügbar" : "Nicht verfügbar"}
              </div>
              <div className="text-xs text-smoke mt-0.5">
                {isAvailable
                  ? "Termine können an diesem Tag gebucht werden"
                  : "Tag gesperrt — z.B. Urlaub, Familienfeier"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isAvailable}
              onClick={() => setIsAvailable((v) => !v)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition"
              style={{
                background: isAvailable ? "rgb(120, 167, 119)" : "var(--stone)",
              }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white transition"
                style={{ transform: isAvailable ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>

          {/* Zeitfenster-Editor — nur wenn verfügbar */}
          {isAvailable && (
            <div className="space-y-3">
              {/* Mode-Toggle */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg border border-stone bg-linen/50">
                <button
                  type="button"
                  onClick={() => setUseDefault(true)}
                  className="text-xs h-8 rounded transition"
                  style={{
                    background: useDefault ? "var(--paper)" : "transparent",
                    color: useDefault ? "var(--ink)" : "var(--smoke)",
                    boxShadow: useDefault ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                  }}
                >
                  Ganzer Tag
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseDefault(false);
                    if (windows.length === 0) {
                      // Hilfreich: initial ein Fenster anlegen
                      setWindows([{ start: 9 * 60, end: 13 * 60 }]);
                    }
                  }}
                  className="text-xs h-8 rounded transition"
                  style={{
                    background: !useDefault ? "var(--paper)" : "transparent",
                    color: !useDefault ? "var(--ink)" : "var(--smoke)",
                    boxShadow: !useDefault ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                  }}
                >
                  Eigene Zeitfenster
                </button>
              </div>

              {useDefault ? (
                <div className="text-xs text-smoke px-1">
                  Verfügbar wie dein Standard-Tagesfenster.
                </div>
              ) : (
                <div className="space-y-2">
                  {windows.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={minutesToHHMM(w.start)}
                        onChange={(e) => updateWindow(i, "start", e.target.value)}
                        step={900}
                        className="input h-9 text-sm tabular-nums w-28"
                      />
                      <span className="text-smoke text-xs">–</span>
                      <input
                        type="time"
                        value={minutesToHHMM(w.end)}
                        onChange={(e) => updateWindow(i, "end", e.target.value)}
                        step={900}
                        className="input h-9 text-sm tabular-nums w-28"
                      />
                      <button
                        type="button"
                        onClick={() => removeWindow(i)}
                        className="btn-icon shrink-0"
                        aria-label="Zeitfenster entfernen"
                        title="Entfernen"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={addWindow}
                      disabled={windows.length >= 6}
                      className="btn-secondary text-xs h-8"
                    >
                      <Plus size={12} /> Fenster
                    </button>
                    <button
                      type="button"
                      onClick={() => quickAdd(9 * 60, 13 * 60)}
                      className="btn-ghost text-xs h-8"
                      title="09:00–13:00 hinzufügen"
                    >
                      + Vormittag (09–13)
                    </button>
                    <button
                      type="button"
                      onClick={() => quickAdd(14 * 60, 18 * 60)}
                      className="btn-ghost text-xs h-8"
                      title="14:00–18:00 hinzufügen"
                    >
                      + Nachmittag (14–18)
                    </button>
                  </div>
                  {windows.length === 0 && (
                    <div className="text-xs text-taupe">
                      Keine Zeitfenster — füge mindestens eins hinzu, sonst wird der Tag als geschlossen behandelt.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notiz */}
          <div>
            <label className="text-xs text-smoke">Notiz</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z.B. Urlaub, Familienfeier …"
              className="input h-9 text-sm mt-1"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-stone/60">
            <div>
              {availability?.isOverride && (
                <button
                  type="button"
                  onClick={resetToWeekly}
                  disabled={pending}
                  className="btn-ghost text-xs h-8 text-smoke"
                >
                  Wieder Wochenregel verwenden
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="btn-ghost text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="btn-primary text-sm"
              >
                <Save size={13} /> {pending ? "Speichern…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FreeSlotsPanel({
  nextFreeDays,
  onPick,
}: {
  nextFreeDays: AvailabilityDay[];
  onPick: (ymd: string) => void;
}) {
  if (nextFreeDays.length === 0) {
    return (
      <div className="card p-6 mt-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-linen flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-smoke" />
          </div>
          <div>
            <div className="font-medium">Keine freien Termine in den nächsten 90 Tagen</div>
            <div className="text-sm text-smoke mt-1">
              Erhöhe in den Einstellungen deine Slots pro Wochentag oder entferne eine Ausnahme.{" "}
              <Link href="/einstellungen?tab=kalender" className="underline hover:text-ink">
                Verfügbarkeit anpassen →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden mt-6">
      <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
        <div>
          <div className="eyebrow eyebrow-muted flex items-center gap-1.5">
            <Sparkles size={11} /> Nächste freie Termine
          </div>
          <div className="text-sm text-smoke mt-1">
            Die nächsten Tage, an denen du noch Slots hast — direkt in der Liste buchen.
          </div>
        </div>
        <Link href="/einstellungen?tab=kalender" className="btn-ghost text-xs h-8">
          Verfügbarkeit anpassen
        </Link>
      </div>
      <ul className="divide-y divide-stone/60">
        {nextFreeDays.map((d) => {
          const date = new Date(d.date + "T00:00:00");
          const dayLabel = date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });
          const busyMinutes = d.busyWindows.reduce((s, w) => s + (w.end - w.start), 0);
          return (
            <li key={d.date} className="px-6 py-3 flex items-center gap-4 hover:bg-linen/40 transition">
              <div className="w-12 text-center shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-smoke">
                  {date.toLocaleDateString("de-DE", { month: "short" })}
                </div>
                <div className="font-serif text-xl leading-none mt-0.5">{date.getDate()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{dayLabel}</div>
                <div className="text-xs text-smoke mt-0.5 truncate">
                  {formatHours(d.freeMinutes)} frei
                  {d.freeWindows.length > 0 && ` · ${formatRanges(d.freeWindows)}`}
                  {busyMinutes > 0 && ` · ${formatHours(busyMinutes)} belegt`}
                  {d.note && ` · ${d.note}`}
                </div>
              </div>
              <button
                onClick={() => onPick(d.date)}
                className="btn-primary text-xs h-8"
              >
                <Plus size={12} /> Termin
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DayCell({
  date, dayKey, inMonth, isToday, isWeekend, isLastRow, isLastCol, shootings, externalEvents, bookings, availability, dimNonFree, onSelect, onSelectBooking, onCreate, onEditAvailability,
}: {
  date: Date;
  dayKey: string;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isLastRow: boolean;
  isLastCol: boolean;
  shootings: CalendarShooting[];
  externalEvents: ExternalEvent[];
  bookings: CalendarBooking[];
  availability: AvailabilityDay | null;
  dimNonFree: boolean;
  onSelect: (s: CalendarShooting) => void;
  onSelectBooking: (b: CalendarBooking) => void;
  onCreate: () => void;
  onEditAvailability: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: dayKey });

  // Verfügbarkeits-Status für die Tag-Hintergrund-Farbe.
  // — hasFreeTime:   Tag hat noch freie Zeit → grünlich
  // — isFull:        Tag offen, aber komplett belegt → neutral
  // — isClosed:      Tag nicht verfügbar (Wochenregel oder Override) → grau
  const isClosed = !availability || (!availability.isAvailable);
  const totalMins = availability ? availability.windows.reduce((s, w) => s + (w.end - w.start), 0) : 0;
  const freeMins = availability?.freeMinutes ?? 0;
  const hasFreeTime = !!(availability?.isAvailable && freeMins > 0);
  const isFull = !!(availability?.isAvailable && totalMins > 0 && freeMins === 0);

  let baseBg: string;
  if (!inMonth) baseBg = "var(--linen)";
  else if (isClosed) baseBg = "rgba(236, 235, 232, 0.65)";
  else if (hasFreeTime) baseBg = "rgba(120, 167, 119, 0.16)";  // klares aber dezentes Grün
  else if (isWeekend) baseBg = "rgba(236, 235, 232, 0.45)";
  else baseBg = "var(--paper)";

  const dimmed = dimNonFree && inMonth && !hasFreeTime;
  const isOverride = !!availability?.isOverride;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[100px] p-2 transition group/cell relative",
        !isLastRow && "border-b border-stone/60",
        !isLastCol && "border-r border-stone/60",
      )}
      style={{
        background: isOver ? "var(--accent-soft)" : baseBg,
        opacity: inMonth ? (dimmed ? 0.35 : 1) : 0.55,
        outline: isOver
          ? "2px solid var(--accent)"
          : (hasFreeTime && inMonth ? "1px solid rgba(120, 167, 119, 0.45)" : "none"),
        outlineOffset: -1,
      }}
    >
      {/* Override-Indikator: kleiner Punkt links oben, zeigt „Lisa hat hier manuell etwas geändert" */}
      {inMonth && isOverride && (
        <div
          className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--accent)" }}
          title="Manuelle Ausnahme"
        />
      )}

      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={inMonth ? onEditAvailability : undefined}
          disabled={!inMonth}
          className={cn(
            "inline-flex items-center justify-center rounded-full text-xs font-medium w-6 h-6 transition",
            inMonth && "hover:ring-2 hover:ring-stone cursor-pointer",
          )}
          title={inMonth ? "Verfügbarkeit für diesen Tag anpassen" : undefined}
          style={{
            background: isToday ? "var(--accent)" : "transparent",
            color: isToday ? "#fff" : inMonth ? "var(--ink)" : "var(--smoke)",
          }}
        >
          {date.getDate()}
        </button>
        <div className="flex items-center gap-1">
          {inMonth && hasFreeTime && availability && (
            <button
              type="button"
              onClick={onEditAvailability}
              className="text-[9px] tabular-nums px-1.5 py-0.5 rounded font-medium hover:ring-1 hover:ring-stone transition"
              style={{
                background: "rgba(120, 167, 119, 0.26)",
                color: "rgb(60, 105, 60)",
              }}
              title={`Frei: ${availability.freeMinutes} Min · ${formatRanges(availability.freeWindows)}`}
            >
              {formatHours(availability.freeMinutes)}
            </button>
          )}
          {inMonth && isFull && availability && (
            <button
              type="button"
              onClick={onEditAvailability}
              className="text-[9px] tabular-nums px-1.5 py-0.5 rounded font-medium hover:ring-1 hover:ring-stone transition"
              style={{
                background: "rgba(0,0,0,0.06)",
                color: "var(--smoke)",
              }}
              title={`Voll belegt · ${formatRanges(availability.windows)} · klicken zum Anpassen`}
            >
              voll
            </button>
          )}
          {inMonth && isClosed && (
            <button
              type="button"
              onClick={onEditAvailability}
              className="text-[9px] uppercase tracking-wider text-smoke flex items-center gap-0.5 hover:text-ink transition"
              title={availability?.note ?? "Nicht verfügbar — klicken zum Anpassen"}
            >
              <CalendarOff size={9} />
            </button>
          )}
          {inMonth && !isClosed && (
            <button
              type="button"
              onClick={onCreate}
              className="opacity-0 group-hover/cell:opacity-100 transition w-5 h-5 rounded-md flex items-center justify-center hover:bg-linen"
              title="Termin anlegen"
              aria-label="Termin anlegen"
              style={{ color: "var(--smoke)" }}
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>

      <ul className="space-y-1">
        {shootings.slice(0, 3).map((s) => (
          <li key={s.id}>
            <DraggableShootingTile shooting={s} onClick={() => onSelect(s)} />
          </li>
        ))}
        {/* Online-Buchungen: eigenes Tile mit grünem Akzent, klickbar */}
        {bookings.slice(0, Math.max(0, 5 - Math.min(shootings.length, 3))).map((b) => (
          <li key={b.id}>
            <BookingTile booking={b} onClick={() => onSelectBooking(b)} />
          </li>
        ))}
        {/* Externe Events: read-only Konflikt-Anzeige */}
        {externalEvents.slice(0, Math.max(0, 5 - Math.min(shootings.length, 3) - Math.min(bookings.length, 2))).map((e) => (
          <li key={e.id}>
            <ExternalEventTile event={e} />
          </li>
        ))}
        {(shootings.length + bookings.length + externalEvents.length) > 5 && (
          <li className="text-[11px] text-smoke px-1.5">
            +{(shootings.length + bookings.length + externalEvents.length) - 5} weitere
          </li>
        )}
      </ul>
    </div>
  );
}

// Online-Buchung-Tile: grünlicher Akzent, gestrichelt bei PENDING, solid bei CONFIRMED.
// Klick → öffnet das BookingDetailModal mit Quick-Annehmen/Ablehnen.
function BookingTile({ booking, onClick }: { booking: CalendarBooking; onClick: () => void }) {
  const time = new Date(booking.startAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const isPending = booking.status === "PENDING";
  const color = isPending ? "rgb(80, 130, 80)" : "rgb(70, 115, 70)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md px-2 py-1.5 transition hover:brightness-105"
      style={{
        background: "rgba(120, 167, 119, 0.12)",
        borderLeft: `3px ${isPending ? "dashed" : "solid"} ${color}`,
      }}
      title={`Online-Buchung: ${booking.customerName} · ${booking.bookingTypeName} · ${isPending ? "Anfrage" : "Bestätigt"}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] tabular-nums" style={{ color: "var(--ink)" }}>
        <Clock size={9} className="shrink-0 opacity-70" />
        <span className="font-medium">{time}</span>
        <span
          className="text-[8px] uppercase tracking-wider px-1 rounded ml-auto"
          style={{
            background: isPending ? color : `${color}30`,
            color: isPending ? "#fff" : color,
          }}
        >
          {isPending ? "Neu" : "✓"}
        </span>
      </div>
      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--ink)" }}>
        {booking.customerName}
      </div>
    </button>
  );
}

function ExternalEventTile({ event }: { event: ExternalEvent }) {
  const time = new Date(event.startAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      className="rounded-md px-2 py-1 cursor-default"
      style={{
        background: "rgba(0,0,0,0.025)",
        borderLeft: "2px dashed var(--stone)",
        opacity: 0.7,
      }}
      title={`Extern (${event.provider}): ${event.summary ?? "Termin"} · ${time}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] tabular-nums" style={{ color: "var(--smoke)" }}>
        <Clock size={8} className="shrink-0 opacity-50" />
        <span>{time}</span>
      </div>
      {event.summary && (
        <div className="text-[11px] truncate italic" style={{ color: "var(--smoke)" }}>
          {event.summary}
        </div>
      )}
    </div>
  );
}

function DraggableShootingTile({
  shooting, onClick,
}: { shooting: CalendarShooting; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: shooting.id });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="w-full text-left"
      style={{ opacity: isDragging ? 0 : 1, cursor: isDragging ? "grabbing" : "grab" }}
    >
      <ShootingTile shooting={shooting} />
    </button>
  );
}

function ShootingTile({ shooting, isOverlay }: { shooting: CalendarShooting; isOverlay?: boolean }) {
  const time = new Date(shooting.scheduledAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const color = shooting.statusColor ?? "#9F877F";
  return (
    <div
      className="rounded-md px-2 py-1.5 transition"
      style={{
        background: `${color}10`,
        borderLeft: `3px solid ${color}`,
        boxShadow: isOverlay ? "0 6px 20px rgba(25,25,26,0.15)" : undefined,
      }}
    >
      <div className="flex items-center gap-1.5 text-[11px] tabular-nums" style={{ color: "var(--ink)" }}>
        <Clock size={9} className="shrink-0 opacity-70" />
        <span className="font-medium">{time}</span>
      </div>
      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--ink)" }}>
        {shooting.customerFirstName} {shooting.customerLastName}
      </div>
      {shooting.location && (
        <div className="flex items-center gap-1 text-[10px] text-smoke mt-0.5 truncate">
          <MapPin size={8} className="shrink-0" />
          <span className="truncate">{shooting.location}</span>
        </div>
      )}
    </div>
  );
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Formatiert Minuten als kompaktes Label: 45min, 5h, 5,5h
function formatHours(min: number): string {
  if (min < 60) return `${min}min`;
  const h = min / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1).replace(".", ",")}h`;
}

// Formatiert Zeitfenster als „09:00–13:00 · 14:30–18:00"
function formatRanges(windows: TimeWindow[]): string {
  return windows.map((w) => `${fmtMin(w.start)}–${fmtMin(w.end)}`).join(" · ");
}

function CalendarLink({ basePath, year, month, label, icon }: { basePath: string; year: number; month: number; label: string; icon: React.ReactNode }) {
  const param = `${year}-${String(month).padStart(2, "0")}`;
  const sep = basePath.includes("?") ? "&" : "?";
  return (
    <Link href={`${basePath}${sep}month=${param}`} aria-label={label} className="btn-icon" title={label}>
      {icon}
    </Link>
  );
}

// Schlägt eine sinnvolle Start-Uhrzeit vor.
// Priorität: erstes freies Fenster (Anfang aufgerundet auf 15-Min-Raster),
// sonst Anfang des ersten Tagesfensters, sonst 10:00.
function suggestStartTime(availability: AvailabilityDay | null): string {
  if (availability && availability.isAvailable) {
    if (availability.freeWindows.length > 0) {
      const first = availability.freeWindows[0]!.start;
      const rounded = Math.ceil(first / 15) * 15;
      return minutesToHHMM(rounded);
    }
    if (availability.windows.length > 0) {
      return minutesToHHMM(availability.windows[0]!.start);
    }
  }
  return "10:00";
}

function QuickCreateModal({
  isoDate, customers, packages, existingShootings, availability, quickPicks, onSwitchDate, onClose,
}: {
  isoDate: string;
  customers: CalendarCustomer[];
  packages: CalendarPackage[];
  existingShootings: CalendarShooting[];
  availability: AvailabilityDay | null;
  quickPicks: AvailabilityDay[];
  onSwitchDate: (ymd: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [time, setTime] = useState(() => suggestStartTime(availability));
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [packageId, setPackageId] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState<string>("");
  const [durationMin, setDurationMin] = useState<string>("");

  // Verhindert TS-warning über "unused" während Refactor (existingShootings könnte
  // später wieder gebraucht werden, aber suggestStartTime nutzt es nicht mehr).
  void existingShootings;

  const dateLabel = new Date(isoDate + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Paket-Daten für Dauer + Buffer (für valide Start-Time-Chips)
  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const effectiveDurationMin = selectedPackage?.durationMin
    ?? (durationMin ? Number(durationMin) : 60);
  const bufferBefore = selectedPackage?.bookingBufferBeforeMin ?? 0;
  const bufferAfter = selectedPackage?.bookingBufferAfterMin ?? 0;

  // Mögliche Start-Zeiten an diesem Tag (15-Min-Raster)
  const validStartTimes = useMemo(() => {
    if (!availability || !availability.isAvailable) return [];
    return findStartTimesInDay(
      availability,
      Math.max(15, effectiveDurationMin || 60),
      bufferBefore,
      bufferAfter,
      15,
    );
  }, [availability, effectiveDurationMin, bufferBefore, bufferAfter]);

  // Wenn Lisa ein Paket wählt: Preis + Dauer + Titel-Vorschlag aus Paket übernehmen,
  // sofern die Felder noch leer sind.
  function onPickPackage(id: string) {
    setPackageId(id);
    const p = packages.find((x) => x.id === id);
    if (!p) return;
    if (!price) setPrice(String(p.price));
    if (!durationMin && p.durationMin) setDurationMin(String(p.durationMin));
    if (!title) {
      const c = customers.find((x) => x.id === customerId);
      setTitle(c ? `${p.name} — ${c.firstName}` : p.name);
    }
  }

  // Titel automatisch zusammenbauen, sobald Lisa Kundin (oder Paket) wechselt
  function onPickCustomer(id: string) {
    setCustomerId(id);
    if (!title) {
      const c = customers.find((x) => x.id === id);
      const p = packages.find((x) => x.id === packageId);
      if (c) setTitle(p ? `${p.name} — ${c.firstName}` : `Shooting ${c.firstName}`);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customerId) {
      toast.error("Bitte eine Kundin wählen");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("scheduledAt", `${isoDate}T${time}`);
    if (durationMin) fd.set("durationMin", durationMin);
    startTransition(async () => {
      try {
        await createShooting(fd);
        // createShooting redirected normalerweise — wenn wir hier ankommen, manuell refreshen
        toast.success("Termin angelegt");
        router.refresh();
        onClose();
      } catch (err: any) {
        if (err?.digest?.startsWith?.("NEXT_REDIRECT")) {
          // Erfolg → Stripe-typische Next-Redirect
          return;
        }
        toast.error(err?.message ?? "Konnte nicht anlegen");
      }
    });
  }

  if (customers.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={onClose}>
        <div className="card max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
          <div className="font-serif text-lg mb-2">Noch keine Kundinnen</div>
          <div className="text-sm text-smoke mb-4">
            Lege erst eine Kundin an, dann kannst du Termine aus dem Kalender heraus erstellen.
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Schließen</button>
            <Link href="/kunden/neu" className="btn-primary text-sm">
              <Plus size={13} /> Kundin anlegen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5" style={{ background: "var(--accent)" }} />
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow eyebrow-muted">Neuer Termin</div>
              <div className="font-serif text-xl mt-0.5">{dateLabel}</div>
              {existingShootings.length > 0 && (
                <div className="text-xs text-smoke mt-1">
                  {existingShootings.length} {existingShootings.length === 1 ? "Termin" : "Termine"} an diesem Tag —
                  Vorschlag ab {time} Uhr
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="btn-icon shrink-0" aria-label="Schließen">
              <X size={15} />
            </button>
          </div>

          {availability && !availability.isAvailable && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg border text-sm"
              style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
            >
              <CalendarOff size={16} className="shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
              <div>
                <div className="font-medium" style={{ color: "var(--accent)" }}>
                  Tag eigentlich nicht verfügbar
                </div>
                <div className="text-xs text-smoke mt-0.5">
                  {availability.note ?? "Wochenregel/Ausnahme sagt: geschlossen."} Du kannst den Termin trotzdem anlegen.
                </div>
              </div>
            </div>
          )}
          {availability && availability.isAvailable && availability.freeMinutes === 0 && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg border text-sm"
              style={{ borderColor: "rgba(159, 135, 127, 0.5)", background: "var(--linen)" }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-taupe" />
              <div>
                <div className="font-medium">Tag bereits voll belegt</div>
                <div className="text-xs text-smoke mt-0.5">
                  Keine freie Zeit im Tagesfenster — über-buchen ist möglich, prüfe vorher.
                </div>
              </div>
            </div>
          )}
          {availability && availability.isAvailable && availability.freeMinutes > 0 && (
            <div className="text-xs text-smoke flex items-center gap-1.5 flex-wrap">
              <Sparkles size={11} style={{ color: "rgb(80, 130, 80)" }} />
              <span>{formatHours(availability.freeMinutes)} frei</span>
              {availability.freeWindows.length > 0 && (
                <span className="opacity-70">· {formatRanges(availability.freeWindows)}</span>
              )}
              {availability.note && <span className="opacity-70"> · {availability.note}</span>}
            </div>
          )}
          {availability && (!availability.isAvailable || availability.freeMinutes === 0) && quickPicks.length > 0 && (
            <div className="rounded-lg border border-stone bg-paper p-3 space-y-2">
              <div className="text-xs text-smoke flex items-center gap-1.5">
                <Sparkles size={11} style={{ color: "rgb(80, 130, 80)" }} /> Stattdessen ein freier Tag?
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickPicks.map((d) => {
                  const dt = new Date(d.date + "T00:00:00");
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => onSwitchDate(d.date)}
                      className="text-xs px-2 py-1 rounded border border-stone hover:bg-linen transition tabular-nums"
                      title={`${formatHours(d.freeMinutes)} frei · ${formatRanges(d.freeWindows)}`}
                    >
                      {dt.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
                      <span className="ml-1.5 text-[10px] text-smoke">{formatHours(d.freeMinutes)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Valide Start-Zeit-Chips (basierend auf Paket-Dauer + Buffer) */}
          {availability && availability.isAvailable && validStartTimes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-smoke">Passende Startzeiten</div>
              <div className="flex flex-wrap gap-1.5">
                {validStartTimes.slice(0, 12).map((min) => {
                  const hhmm = minutesToHHMM(min);
                  const active = time === hhmm;
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setTime(hhmm)}
                      className="text-xs h-7 px-2 rounded border tabular-nums transition"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--stone)",
                        background: active ? "var(--accent-soft)" : "var(--paper)",
                        color: active ? "var(--accent)" : "var(--ink)",
                        fontWeight: active ? 500 : 400,
                      }}
                    >
                      {hhmm}
                    </button>
                  );
                })}
                {validStartTimes.length > 12 && (
                  <span className="text-[11px] text-smoke self-center">+{validStartTimes.length - 12}</span>
                )}
              </div>
            </div>
          )}
          {availability && availability.isAvailable && validStartTimes.length === 0 && packageId && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg border text-sm"
              style={{ borderColor: "rgba(159, 135, 127, 0.5)", background: "var(--linen)" }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-taupe" />
              <div>
                <div className="font-medium">Paket-Dauer passt in keine freie Zeit an diesem Tag.</div>
                <div className="text-xs text-smoke mt-0.5">
                  Wähle ein kürzeres Paket, einen anderen Tag oder lege den Termin trotzdem an (manuelle Uhrzeit unten).
                </div>
              </div>
            </div>
          )}

          <FormRow>
            <Field label="Uhrzeit">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step={900}
                required
                className="input h-9 text-sm"
              />
            </Field>
            <Field label="Dauer (Min.)" hint="optional">
              <input
                type="number"
                min="15"
                step="15"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="z.B. 120"
                className="input h-9 text-sm"
              />
            </Field>
          </FormRow>

          {/* Paket-Dauer-Hinweis */}
          {(selectedPackage || effectiveDurationMin) && (
            <div className="text-[11px] text-smoke -mt-1">
              Paket benötigt: {formatHours(effectiveDurationMin)}
              {(bufferBefore > 0 || bufferAfter > 0) && (
                <> (+ {bufferBefore + bufferAfter} Min Puffer)</>
              )}
            </div>
          )}

          <Field label="Kundin *">
            <select
              name="customerId"
              value={customerId}
              onChange={(e) => onPickCustomer(e.target.value)}
              required
              className="select h-9 text-sm"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </Field>

          <Field label="Paket" hint={packages.length === 0 ? "Keine aktiven Pakete — Preis manuell setzen" : "optional · setzt Preis & Dauer"}>
            <select
              name="packageId"
              value={packageId}
              onChange={(e) => onPickPackage(e.target.value)}
              className="select h-9 text-sm"
              disabled={packages.length === 0}
            >
              <option value="">— ohne Paket —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.price ? ` · ${formatEUR(p.price)}` : ""}</option>
              ))}
            </select>
          </Field>

          <Field label="Titel *">
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Boudoir-Shooting Anna"
              required
              className="input h-9 text-sm"
            />
          </Field>

          <Field label="Preis (€) *">
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className="input h-9 text-sm w-40"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
            <button type="button" onClick={onClose} className="btn-ghost text-sm" disabled={pending}>
              Abbrechen
            </button>
            <button type="submit" className="btn-primary text-sm" disabled={pending}>
              <Save size={13} /> {pending ? "Anlegen…" : "Termin anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShootingModal({ shooting, onClose }: { shooting: CalendarShooting; onClose: () => void }) {
  const date = new Date(shooting.scheduledAt);
  const dateStr = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header mit Statusband oben */}
        <div
          className="h-1.5"
          style={{ background: shooting.statusColor ?? "var(--taupe)" }}
        />
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              {shooting.statusLabel && (
                <div
                  className="badge mb-2"
                  style={{ background: `${shooting.statusColor ?? "#9F877F"}15`, color: shooting.statusColor ?? "var(--smoke)" }}
                >
                  {shooting.statusLabel}
                </div>
              )}
              <div className="font-serif text-2xl leading-tight">{shooting.title}</div>
              {shooting.packageName && (
                <div className="text-sm text-smoke mt-1 flex items-center gap-1.5">
                  <PackageIcon size={12} /> {shooting.packageName}
                </div>
              )}
            </div>
            <button onClick={onClose} className="btn-icon shrink-0" aria-label="Schließen">
              <X size={15} />
            </button>
          </div>

          <ul className="space-y-2.5 text-sm border-t border-stone/60 pt-4">
            <li className="flex items-start gap-3">
              <CalendarIcon size={15} className="text-smoke shrink-0 mt-0.5" />
              <span>
                {dateStr}
                <span className="text-smoke"> · {timeStr} Uhr</span>
                {shooting.durationMin && <span className="text-smoke"> · {shooting.durationMin} Min.</span>}
              </span>
            </li>
            <li className="flex items-center gap-3">
              <User size={15} className="text-smoke shrink-0" />
              <Link href={`/kunden/${shooting.customerId}`} className="hover:underline">
                {shooting.customerFirstName} {shooting.customerLastName}
              </Link>
            </li>
            {shooting.location && (
              <li className="flex items-start gap-3">
                <MapPin size={15} className="text-smoke shrink-0 mt-0.5" />
                <span>{shooting.location}</span>
              </li>
            )}
            <li className="flex items-center gap-3">
              <Euro size={15} className="text-smoke shrink-0" />
              <span className="tabular-nums">{formatEUR(shooting.price)}</span>
            </li>
          </ul>

          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-stone/60">
            <button onClick={onClose} className="btn-ghost text-sm">Schließen</button>
            <Link href={`/shootings/${shooting.id}`} className="btn-primary text-sm">
              <ExternalLink size={13} /> Zur Detailansicht
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== BOOKING-DETAIL-MODAL ===================

function BookingDetailModal({ booking, onClose }: { booking: CalendarBooking; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const date = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const dateStr = date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = `${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  const isPending = booking.status === "PENDING";

  function onAccept() {
    startTransition(async () => {
      try {
        const { shootingId } = await acceptBooking(booking.id);
        toast.success("Buchung angenommen — Shooting angelegt");
        router.push(`/shootings/${shootingId}`);
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht annehmen");
      }
    });
  }
  function onReject() {
    if (!confirm("Buchung wirklich ablehnen?")) return;
    startTransition(async () => {
      try {
        await cancelBooking(booking.id);
        toast.success("Buchung abgelehnt");
        router.refresh();
        onClose();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht ablehnen");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5" style={{ background: "rgb(70, 115, 70)" }} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <div className="badge mb-2" style={{ background: "rgba(120, 167, 119, 0.15)", color: "rgb(70, 115, 70)" }}>
                {isPending ? "Neue Anfrage" : "Bestätigt"}
              </div>
              <div className="font-serif text-2xl leading-tight">{booking.bookingTypeName}</div>
              <div className="text-sm text-smoke mt-1">Online-Buchung</div>
            </div>
            <button onClick={onClose} className="btn-icon shrink-0" aria-label="Schließen">
              <X size={15} />
            </button>
          </div>

          <ul className="space-y-2.5 text-sm border-t border-stone/60 pt-4">
            <li className="flex items-start gap-3">
              <CalendarIcon size={15} className="text-smoke shrink-0 mt-0.5" />
              <span>{dateStr}<span className="text-smoke"> · {timeStr}</span></span>
            </li>
            <li className="flex items-center gap-3">
              <User size={15} className="text-smoke shrink-0" />
              <span>{booking.customerName}</span>
            </li>
            <li className="flex items-center gap-3">
              <Mail size={15} className="text-smoke shrink-0" />
              <a href={`mailto:${booking.customerEmail}`} className="hover:underline">{booking.customerEmail}</a>
            </li>
            {booking.meetingUrl && (
              <li className="flex items-start gap-3 pt-2 border-t border-stone/40">
                <Video size={15} className="text-smoke shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-smoke">{booking.meetingProvider ?? "Online"} Meeting</div>
                  <a href={booking.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline break-all hover:no-underline" style={{ color: "rgb(70, 115, 70)" }}>
                    {booking.meetingUrl}
                  </a>
                </div>
              </li>
            )}
          </ul>

          <div className="flex justify-between items-center gap-2 mt-5 pt-4 border-t border-stone/60">
            <Link href="/buchungen" className="btn-ghost text-sm">
              Zur Inbox
            </Link>
            <div className="flex gap-2">
              {isPending && (
                <>
                  <button onClick={onReject} disabled={pending} className="btn-secondary text-sm">
                    Ablehnen
                  </button>
                  <button onClick={onAccept} disabled={pending} className="btn-primary text-sm">
                    Annehmen
                  </button>
                </>
              )}
              {!isPending && (
                <button onClick={onClose} className="btn-ghost text-sm">Schließen</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
