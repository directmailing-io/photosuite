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
  X, ExternalLink, User, Package as PackageIcon, Euro, Plus, Save,
  Sparkles, AlertTriangle, CalendarOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatEUR } from "@/lib/utils";
import { Field, FormRow } from "@/components/form/Field";
import { moveShootingToDate, createShooting } from "./actions";

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
export type CalendarPackage = { id: string; name: string; price: number; durationMin: number | null };

export type ExternalEvent = {
  id: string;
  startAt: string;
  endAt: string;
  summary: string | null;
  provider: string;
};

// Spiegelt DayStatus aus lib/availability — als serialisierbarer Plain-Object.
export type AvailabilityDay = {
  date: string;          // YYYY-MM-DD
  weekday: number;
  maxShootings: number;
  bookedCount: number;
  freeSlots: number;
  isOverride: boolean;
  note: string | null;
};

type Props = {
  shootings: CalendarShooting[];
  externalEvents: ExternalEvent[];
  year: number;
  month: number;
  customers: CalendarCustomer[];
  packages: CalendarPackage[];
  availability: AvailabilityDay[];
  nextFreeDays: AvailabilityDay[];
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

export function CalendarView({ shootings: initialShootings, externalEvents, year, month, customers, packages, availability, nextFreeDays }: Props) {
  const router = useRouter();
  const [shootings, setShootings] = useState(initialShootings);
  const [selected, setSelected] = useState<CalendarShooting | null>(null);
  const [createForDate, setCreateForDate] = useState<string | null>(null); // YYYY-MM-DD
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
            <CalendarLink year={prev.year} month={prev.month} label="Voriger Monat" icon={<ChevronLeft size={16} />} />
            <CalendarLink year={next.year} month={next.month} label="Nächster Monat" icon={<ChevronRight size={16} />} />
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
              <Link href={`/shootings?view=calendar&month=${todayParam}`} className="btn-secondary text-xs h-9">
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
                  availability={dayAvailability}
                  dimNonFree={showOnlyFree}
                  onSelect={(s) => setSelected(s)}
                  onCreate={() => setCreateForDate(dayKey)}
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

      {createForDate && (
        <QuickCreateModal
          isoDate={createForDate}
          customers={customers}
          packages={packages}
          existingShootings={byDay.get(createForDate) ?? []}
          availability={availabilityByDay.get(createForDate) ?? null}
          onClose={() => setCreateForDate(null)}
        />
      )}

      <FreeSlotsPanel nextFreeDays={nextFreeDays} onPick={(ymd) => setCreateForDate(ymd)} />
    </>
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
                <div className="text-xs text-smoke mt-0.5">
                  {d.freeSlots} von {d.maxShootings} frei
                  {d.bookedCount > 0 && ` · ${d.bookedCount} bereits gebucht`}
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
  date, dayKey, inMonth, isToday, isWeekend, isLastRow, isLastCol, shootings, externalEvents, availability, dimNonFree, onSelect, onCreate,
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
  availability: AvailabilityDay | null;
  dimNonFree: boolean;
  onSelect: (s: CalendarShooting) => void;
  onCreate: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: dayKey });

  // Verfügbarkeits-Status für die Tag-Hintergrund-Farbe.
  // — hasFreeSlots:  Tag hat Kapazität und ist noch nicht voll → grünlich
  // — isFull:        Tag hat Kapazität, aber voll belegt → neutral
  // — isClosed:      maxShootings = 0 (geschlossen / Urlaub) → grau, Plus-Button aus
  // — undefined av:  nicht in Range (sollte nicht passieren) → neutral
  const hasFreeSlots = !!(availability && availability.maxShootings > 0 && availability.freeSlots > 0);
  const isFull = !!(availability && availability.maxShootings > 0 && availability.freeSlots === 0);
  const isClosed = !!(availability && availability.maxShootings === 0);

  let baseBg: string;
  if (!inMonth) baseBg = "var(--linen)";
  else if (isClosed) baseBg = "rgba(236, 235, 232, 0.7)";
  else if (hasFreeSlots) baseBg = "rgba(120, 167, 119, 0.10)";  // sanftes Grün
  else if (isWeekend) baseBg = "rgba(236, 235, 232, 0.45)";
  else baseBg = "var(--paper)";

  // Bei „Nur freie": Tage ohne freie Slots dimmen — aber nur im aktiven Monat.
  const dimmed = dimNonFree && inMonth && !hasFreeSlots;

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
        outline: isOver ? "2px solid var(--accent)" : hasFreeSlots && inMonth ? "1px solid rgba(120, 167, 119, 0.35)" : "none",
        outlineOffset: -1,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div
          className="inline-flex items-center justify-center rounded-full text-xs font-medium w-6 h-6"
          style={{
            background: isToday ? "var(--accent)" : "transparent",
            color: isToday ? "#fff" : inMonth ? "var(--ink)" : "var(--smoke)",
          }}
        >
          {date.getDate()}
        </div>
        <div className="flex items-center gap-1">
          {inMonth && availability && availability.maxShootings > 0 && (
            <span
              className="text-[9px] tabular-nums px-1.5 py-0.5 rounded font-medium"
              style={{
                background: hasFreeSlots ? "rgba(120, 167, 119, 0.20)" : "rgba(0,0,0,0.06)",
                color: hasFreeSlots ? "rgb(70, 115, 70)" : "var(--smoke)",
              }}
              title={
                hasFreeSlots
                  ? `${availability.freeSlots} von ${availability.maxShootings} frei`
                  : `Voll belegt (${availability.bookedCount}/${availability.maxShootings})`
              }
            >
              {hasFreeSlots ? `${availability.freeSlots}/${availability.maxShootings}` : "voll"}
            </span>
          )}
          {inMonth && isClosed && (
            <span
              className="text-[9px] uppercase tracking-wider text-smoke flex items-center gap-0.5"
              title={availability?.note ?? "Nicht verfügbar"}
            >
              <CalendarOff size={9} />
            </span>
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
        {shootings.slice(0, 4).map((s) => (
          <li key={s.id}>
            <DraggableShootingTile shooting={s} onClick={() => onSelect(s)} />
          </li>
        ))}
        {/* Externe Events: gedämpft, nicht draggable, nicht klickbar (read-only Konflikt-Anzeige) */}
        {externalEvents.slice(0, Math.max(0, 5 - Math.min(shootings.length, 4))).map((e) => (
          <li key={e.id}>
            <ExternalEventTile event={e} />
          </li>
        ))}
        {(shootings.length + externalEvents.length) > 5 && (
          <li className="text-[11px] text-smoke px-1.5">
            +{(shootings.length + externalEvents.length) - 5} weitere
          </li>
        )}
      </ul>
    </div>
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

function CalendarLink({ year, month, label, icon }: { year: number; month: number; label: string; icon: React.ReactNode }) {
  const param = `${year}-${String(month).padStart(2, "0")}`;
  return (
    <Link href={`/shootings?view=calendar&month=${param}`} aria-label={label} className="btn-icon" title={label}>
      {icon}
    </Link>
  );
}

// Schlägt eine sinnvolle Start-Uhrzeit vor: 30 Min nach dem zuletzt endenden Termin,
// sonst 10:00 als Standard.
function suggestStartTime(existing: CalendarShooting[]): string {
  if (existing.length === 0) return "10:00";
  const last = existing
    .map((s) => {
      const start = new Date(s.scheduledAt);
      const end = new Date(start.getTime() + (s.durationMin ?? 60) * 60_000);
      return end;
    })
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const next = new Date(last.getTime() + 30 * 60_000);
  // Auf 15-Minuten-Raster runden
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15);
  if (next.getHours() >= 21) return "10:00"; // bei spät: nächster Tag-Default
  return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
}

function QuickCreateModal({
  isoDate, customers, packages, existingShootings, availability, onClose,
}: {
  isoDate: string;
  customers: CalendarCustomer[];
  packages: CalendarPackage[];
  existingShootings: CalendarShooting[];
  availability: AvailabilityDay | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [time, setTime] = useState(() => suggestStartTime(existingShootings));
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [packageId, setPackageId] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState<string>("");
  const [durationMin, setDurationMin] = useState<string>("");

  const dateLabel = new Date(isoDate + "T00:00:00").toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

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

          {availability && availability.maxShootings === 0 && (
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
                  {availability.note ?? "Wochenregel/Ausnahme sagt: kein Slot."} Du kannst den Termin trotzdem anlegen.
                </div>
              </div>
            </div>
          )}
          {availability && availability.maxShootings > 0 && availability.freeSlots === 0 && (
            <div
              className="flex items-start gap-3 p-3 rounded-lg border text-sm"
              style={{ borderColor: "rgba(159, 135, 127, 0.5)", background: "var(--linen)" }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-taupe" />
              <div>
                <div className="font-medium">Tag bereits voll belegt</div>
                <div className="text-xs text-smoke mt-0.5">
                  {availability.bookedCount} von {availability.maxShootings} Slots vergeben — über-buchen ist möglich, prüfe vorher.
                </div>
              </div>
            </div>
          )}
          {availability && availability.maxShootings > 0 && availability.freeSlots > 0 && (
            <div className="text-xs text-smoke flex items-center gap-1.5">
              <Sparkles size={11} style={{ color: "rgb(80, 130, 80)" }} />
              {availability.freeSlots} von {availability.maxShootings} Slots noch frei.
              {availability.note && <span className="opacity-70"> · {availability.note}</span>}
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
