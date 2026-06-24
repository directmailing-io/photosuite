"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Clock, MapPin, Calendar as CalendarIcon,
  CheckCircle2, ArrowLeft, Mail, Phone, MessageSquare, User as UserIcon,
  AlertCircle, Loader2, Video, ExternalLink,
} from "lucide-react";
import { Field } from "@/components/form/Field";
import { submitBooking } from "./actions";
import type { DayWithSlots, BookableSlot } from "@/lib/bookingSlots";

type BookingTypeForClient = {
  slug: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  location: string | null;
  locationsJson: string | null;
  requiredFieldsJson: string | null;
  autoConfirm: boolean;
  requirePhone: boolean;
  requireMessage: boolean;
  color: string;
};

type LocationItem = { key: string; label: string };
type DynamicField = {
  id: string;
  type: "text" | "textarea" | "phone" | "email" | "select" | "checkbox";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
};

function parseLocations(json: string | null, fallback: string | null): LocationItem[] {
  if (json) {
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) {
        const valid = arr
          .filter((p) => p && typeof p.label === "string")
          .map((p) => ({ key: String(p.key ?? "custom"), label: String(p.label) }));
        if (valid.length > 0) return valid;
      }
    } catch { /* fallthrough */ }
  }
  return fallback ? [{ key: "custom", label: fallback }] : [];
}

function parseFields(json: string | null, fallback: { requirePhone: boolean; requireMessage: boolean }): DynamicField[] {
  if (json) {
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) {
        return arr
          .filter((f) => f && typeof f.id === "string" && typeof f.type === "string" && typeof f.label === "string")
          .map((f) => ({
            id: f.id,
            type: f.type,
            label: f.label,
            placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
            required: !!f.required,
            options: Array.isArray(f.options) ? f.options.filter((o: any) => typeof o === "string") : undefined,
          }));
      }
    } catch { /* fallthrough */ }
  }
  // Legacy fallback aus den alten Booleans
  const arr: DynamicField[] = [];
  if (fallback.requirePhone) arr.push({ id: "_phone", type: "phone", label: "Telefonnummer", required: true });
  if (fallback.requireMessage) arr.push({ id: "_msg", type: "textarea", label: "Deine Nachricht", required: true });
  return arr;
}

type Studio = {
  studioName: string | null;
  studioTagline: string | null;
  studioEmail: string | null;
  studioPhone: string | null;
  logoUrl: string | null;
} | null;

type Step = "calendar" | "form" | "done";

const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtPrice(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function providerLabel(provider: string | null): string {
  switch (provider) {
    case "zoom": return "Zoom";
    case "google_meet": return "Google Meet";
    case "teams": return "Microsoft Teams";
    case "whereby": return "Whereby";
    default: return "Online";
  }
}

// Locale-Datums-Helfer ohne TZ-Stolperfallen.
function fmtLongDate(date: string /* YYYY-MM-DD */) {
  const [y, m, d] = date.split("-").map(Number);
  const obj = new Date(y, m - 1, d);
  return obj.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function BookingFlow({
  type,
  studio,
  days,
  year,
  month,
  embed = false,
}: {
  type: BookingTypeForClient;
  studio: Studio;
  days: DayWithSlots[];
  year: number;
  month: number; // 0-basiert
  embed?: boolean;
}) {
  const [step, setStep] = useState<Step>("calendar");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookableSlot | null>(null);
  const [doneFirstName, setDoneFirstName] = useState<string>("");
  const [doneMeeting, setDoneMeeting] = useState<{ url: string | null; provider: string | null }>({ url: null, provider: null });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});

  const locations = useMemo(
    () => parseLocations(type.locationsJson, type.location),
    [type.locationsJson, type.location],
  );
  const dynamicFields = useMemo(
    () => parseFields(type.requiredFieldsJson, { requirePhone: type.requirePhone, requireMessage: type.requireMessage }),
    [type.requiredFieldsJson, type.requirePhone, type.requireMessage],
  );

  // Map: date → DayWithSlots für O(1)-Lookup beim Rendern des Kalenders.
  const daysByDate = useMemo(() => {
    const m = new Map<string, DayWithSlots>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  // 6-Wochen-Grid (Mo-first). Erster Tag = Montag der Woche, in der der 1. liegt.
  const calendarCells = useMemo(() => {
    const first = new Date(year, month, 1);
    // JS: 0=So..6=Sa → wir wollen 0=Mo..6=So
    const jsWeekday = first.getDay();
    const moFirstOffset = (jsWeekday + 6) % 7; // wieviele Tage VOR dem 1. bis Montag
    const gridStart = new Date(year, month, 1 - moFirstOffset);
    const cells: { date: Date; inMonth: boolean; key: string }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      cells.push({
        date: d,
        inMonth: d.getMonth() === month,
        key: ymd(d.getFullYear(), d.getMonth(), d.getDate()),
      });
    }
    return cells;
  }, [year, month]);

  // Heute als YYYY-MM-DD lokal — für "today"-Highlight.
  const todayKey = useMemo(() => {
    const t = new Date();
    return ymd(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  // Prev/Next-Monat als YYYY-MM für ?month=…-Link.
  const prevMonthHref = useMemo(() => {
    const y = month === 0 ? year - 1 : year;
    const m = month === 0 ? 11 : month - 1;
    return `?month=${y}-${pad2(m + 1)}`;
  }, [year, month]);
  const nextMonthHref = useMemo(() => {
    const y = month === 11 ? year + 1 : year;
    const m = month === 11 ? 0 : month + 1;
    return `?month=${y}-${pad2(m + 1)}`;
  }, [year, month]);

  // Ist der Prev-Button sinnvoll? Nicht in vergangene Monate navigieren.
  const isPrevDisabled = useMemo(() => {
    const now = new Date();
    return year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth());
  }, [year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  const selectedDay = selectedDate ? daysByDate.get(selectedDate) : null;

  function selectDay(key: string) {
    setSelectedDate(key);
    setSelectedSlot(null);
  }

  function selectSlot(slot: BookableSlot) {
    setSelectedSlot(slot);
    setStep("form");
    // Sanftes Scrollen nach oben, damit Formular oben in View ist.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    if (!selectedSlot) {
      setError("Kein Termin ausgewählt.");
      return;
    }
    formData.set("startAt", selectedSlot.startISO);

    // Validierung der dynamischen Pflichtfelder + Snapshot der Werte als JSON in `dynamicFieldsJson` —
    // server liest das raus + speichert ins Booking.message (Fallback) oder ein extra Feld.
    const valuesOut: Record<string, string> = {};
    for (const f of dynamicFields) {
      const v = (dynamicValues[f.id] ?? "").trim();
      if (f.required && !v) {
        setError(`Bitte „${f.label}" ausfüllen.`);
        return;
      }
      if (v) valuesOut[f.id] = v;
      // Legacy: Phone und Nachricht ins jeweilige Standard-Feld kopieren,
      // damit der Inbox/CRM weiter die wichtigsten Daten zentral hat.
      if (f.type === "phone" && v) formData.set("customerPhone", v);
      if (f.type === "textarea" && v && !formData.get("message")) formData.set("message", v);
    }
    formData.set("dynamicFieldsJson", JSON.stringify({ values: valuesOut, fields: dynamicFields }));

    const firstName = String(formData.get("customerName") ?? "").trim().split(/\s+/)[0] ?? "";
    startTransition(async () => {
      try {
        const result = await submitBooking(type.slug, formData);
        setDoneFirstName(firstName);
        setDoneMeeting({ url: result.meetingUrl, provider: result.meetingProvider });
        setStep("done");
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Etwas ist schiefgelaufen.");
      }
    });
  }

  function backToCalendar() {
    setStep("calendar");
    setSelectedSlot(null);
    setError(null);
  }

  // ===== Studio-Branding-Header =====
  const studioHeader = (
    <header className="border-b" style={{ background: "rgb(var(--paper))", borderColor: "rgb(var(--stone))" }}>
      <div className="max-w-5xl mx-auto px-6 h-20 flex items-center gap-4">
        {studio?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={studio.logoUrl}
            alt={studio.studioName ?? "Studio"}
            className="h-12 w-auto object-contain block"
          />
        ) : (
          <div
            className="leading-none"
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "22px",
              color: "rgb(var(--ink))",
            }}
          >
            {studio?.studioName ?? "Studio"}
          </div>
        )}
        {studio?.studioName && studio?.logoUrl && (
          <div
            className="hidden sm:block"
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "18px",
              color: "rgb(var(--smoke))",
            }}
          >
            {studio.studioName}
          </div>
        )}
      </div>
    </header>
  );

  // ===== Inhalt pro Step =====
  // Im Embed-Modus: Studio-Header, Außenabstände und Footer kompakter (das Widget
  // soll möglichst nahtlos in eine fremde Webseite eingebettet wirken).
  const mainPad = embed ? "py-6 sm:py-8" : "py-10 sm:py-16";
  const wrapperMaxW = embed ? "max-w-3xl" : "max-w-5xl";
  return (
    <div className={embed ? "" : "min-h-screen"} style={{ background: embed ? "transparent" : "rgb(var(--bg))" }}>
      {!embed && studioHeader}

      <main className={`${wrapperMaxW} mx-auto px-4 sm:px-6 ${mainPad}`}>
        {step === "calendar" && (
          <CalendarStep
            type={type}
            studio={studio}
            locations={locations}
            embed={embed}
            calendarCells={calendarCells}
            daysByDate={daysByDate}
            todayKey={todayKey}
            selectedDate={selectedDate}
            selectedDay={selectedDay ?? null}
            monthLabel={monthLabel}
            prevMonthHref={prevMonthHref}
            nextMonthHref={nextMonthHref}
            isPrevDisabled={isPrevDisabled}
            onSelectDay={selectDay}
            onSelectSlot={selectSlot}
          />
        )}

        {step === "form" && selectedSlot && (
          <FormStep
            type={type}
            slot={selectedSlot}
            locations={locations}
            dynamicFields={dynamicFields}
            dynamicValues={dynamicValues}
            setDynamicValues={setDynamicValues}
            error={error}
            isPending={isPending}
            onBack={backToCalendar}
            onSubmit={handleSubmit}
          />
        )}

        {step === "done" && selectedSlot && (
          <DoneStep
            type={type}
            slot={selectedSlot}
            firstName={doneFirstName}
            studio={studio}
            locations={locations}
            meetingUrl={doneMeeting.url}
            meetingProvider={doneMeeting.provider}
          />
        )}
      </main>

      {!embed && (
        <footer className="max-w-5xl mx-auto px-6 pb-10 text-center text-xs text-smoke">
          <span style={{ color: "rgb(var(--smoke))" }}>
            {studio?.studioName ?? "Studio"} · Online-Terminbuchung
          </span>
        </footer>
      )}
    </div>
  );
}

// =================== STEP 1: KALENDER ===================

function CalendarStep({
  type,
  studio,
  locations,
  embed,
  calendarCells,
  daysByDate,
  todayKey,
  selectedDate,
  selectedDay,
  monthLabel,
  prevMonthHref,
  nextMonthHref,
  isPrevDisabled,
  onSelectDay,
  onSelectSlot,
}: {
  type: BookingTypeForClient;
  studio: Studio;
  locations: LocationItem[];
  embed: boolean;
  calendarCells: { date: Date; inMonth: boolean; key: string }[];
  daysByDate: Map<string, DayWithSlots>;
  todayKey: string;
  selectedDate: string | null;
  selectedDay: DayWithSlots | null;
  monthLabel: string;
  prevMonthHref: string;
  nextMonthHref: string;
  isPrevDisabled: boolean;
  onSelectDay: (key: string) => void;
  onSelectSlot: (slot: BookableSlot) => void;
}) {
  return (
    <div className="space-y-10">
      {/* Hero / Type-Info */}
      <section className="text-center">
        <div className="eyebrow inline-flex items-center gap-2">
          <span
            style={{
              display: "inline-block",
              width: 28,
              height: 1,
              background: "rgb(var(--accent))",
            }}
          />
          Termin buchen
        </div>
        <h1
          className="font-serif font-medium mt-3 leading-[1.05]"
          style={{ fontSize: "clamp(36px, 6vw, 56px)", color: "rgb(var(--ink))" }}
        >
          {type.name}
        </h1>
        {type.description && (
          <p
            className="mt-5 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "rgb(var(--smoke))" }}
          >
            {type.description}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm" style={{ color: "rgb(var(--smoke))" }}>
          <span className="inline-flex items-center gap-1.5">
            <Clock size={14} style={{ color: "rgb(var(--accent))" }} />
            {type.durationMin} Minuten
          </span>
          {locations.map((loc) => (
            <span key={loc.key + loc.label} className="inline-flex items-center gap-1.5">
              <MapPin size={14} style={{ color: "rgb(var(--accent))" }} />
              {loc.label}
            </span>
          ))}
          {type.priceCents > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon size={14} style={{ color: "rgb(var(--accent))" }} />
              {fmtPrice(type.priceCents)}
            </span>
          )}
        </div>
        {/* embed unused intentional — silence */}
        {embed ? null : null}
      </section>

      {/* Kalender + Slot-Liste */}
      <section className="card p-5 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-12">
          {/* LINKS: Kalender */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="eyebrow">Wähle einen Tag</div>
                <div
                  className="font-serif mt-1 capitalize"
                  style={{ fontSize: "26px", color: "rgb(var(--ink))" }}
                >
                  {monthLabel}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isPrevDisabled ? (
                  <button
                    disabled
                    aria-label="Vorheriger Monat"
                    className="btn-icon"
                    style={{ opacity: 0.3, cursor: "not-allowed" }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                ) : (
                  <Link href={prevMonthHref} aria-label="Vorheriger Monat" className="btn-icon" scroll={false}>
                    <ChevronLeft size={18} />
                  </Link>
                )}
                <Link href={nextMonthHref} aria-label="Nächster Monat" className="btn-icon" scroll={false}>
                  <ChevronRight size={18} />
                </Link>
              </div>
            </div>

            {/* Wochentag-Header */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
              {WEEKDAYS_SHORT.map((w) => (
                <div
                  key={w}
                  className="text-center text-[11px] font-semibold tracking-wider uppercase py-1"
                  style={{ color: "rgb(var(--smoke))", letterSpacing: "0.12em" }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Tage */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calendarCells.map((cell) => {
                const dayInfo = daysByDate.get(cell.key);
                const hasSlots = !!dayInfo?.hasSlots;
                const isToday = cell.key === todayKey;
                const isSelected = selectedDate === cell.key;
                const isOtherMonth = !cell.inMonth;

                const baseClass =
                  "aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition relative select-none";

                if (!hasSlots) {
                  // Nicht klickbar — leer/dim
                  return (
                    <div
                      key={cell.key}
                      className={baseClass}
                      style={{
                        color: isOtherMonth ? "transparent" : "rgb(var(--smoke))",
                        background: "transparent",
                        cursor: "not-allowed",
                        opacity: isOtherMonth ? 0 : 0.35,
                      }}
                      aria-disabled="true"
                    >
                      {cell.date.getDate()}
                      {isToday && !isOtherMonth && (
                        <span
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                          style={{ background: "rgb(var(--accent))", opacity: 0.6 }}
                        />
                      )}
                    </div>
                  );
                }

                // Klickbarer Tag
                return (
                  <button
                    key={cell.key}
                    onClick={() => onSelectDay(cell.key)}
                    className={baseClass + " cursor-pointer hover:scale-[1.04]"}
                    style={{
                      background: isSelected ? "rgb(var(--accent))" : "rgb(var(--accent-soft))",
                      color: isSelected ? "white" : "rgb(var(--ink))",
                      border: `1px solid ${isSelected ? "rgb(var(--accent))" : "transparent"}`,
                      fontWeight: isSelected ? 600 : 500,
                    }}
                    aria-pressed={isSelected}
                    aria-label={`${cell.date.getDate()}. – freie Termine verfügbar`}
                  >
                    {cell.date.getDate()}
                    {isToday && !isSelected && (
                      <span
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                        style={{ background: "rgb(var(--accent))" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legende */}
            <div
              className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
              style={{ color: "rgb(var(--smoke))" }}
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ background: "rgb(var(--accent-soft))" }}
                />
                Freie Termine
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ background: "rgb(var(--accent))" }}
                />
                Ausgewählt
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "rgb(var(--accent))" }}
                />
                Heute
              </span>
            </div>
          </div>

          {/* RECHTS: Slot-Liste */}
          <div className="lg:border-l lg:pl-12" style={{ borderColor: "rgb(var(--stone))" }}>
            {!selectedDate && (
              <div
                className="rounded-xl border border-dashed p-8 text-center"
                style={{ borderColor: "rgb(var(--stone))" }}
              >
                <CalendarIcon
                  size={32}
                  className="mx-auto mb-3"
                  style={{ color: "rgb(var(--accent))" }}
                  strokeWidth={1.4}
                />
                <div className="eyebrow">Noch nichts ausgewählt</div>
                <p className="font-serif text-xl mt-2" style={{ color: "rgb(var(--ink))" }}>
                  Wähle einen Tag aus,<br />
                  der frei ist.
                </p>
                <p className="text-xs mt-3" style={{ color: "rgb(var(--smoke))" }}>
                  Freie Tage sind rosa hinterlegt.
                </p>
              </div>
            )}

            {selectedDate && selectedDay && (
              <div>
                <div className="eyebrow">Verfügbare Zeiten</div>
                <h2
                  className="font-serif mt-1 mb-5 capitalize"
                  style={{ fontSize: "24px", color: "rgb(var(--ink))" }}
                >
                  {fmtLongDate(selectedDate)}
                </h2>

                {selectedDay.slots.length === 0 ? (
                  <div
                    className="rounded-lg border p-5 text-sm flex items-start gap-3"
                    style={{
                      borderColor: "rgb(var(--stone))",
                      background: "rgb(var(--linen))",
                      color: "rgb(var(--smoke))",
                    }}
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: "rgb(var(--accent))" }} />
                    <span>
                      Keine freien Slots an diesem Tag — bitte einen anderen wählen.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {selectedDay.slots.map((slot) => (
                      <button
                        key={slot.startISO}
                        onClick={() => onSelectSlot(slot)}
                        className="rounded-lg font-medium transition flex items-center justify-center"
                        style={{
                          minHeight: 48,
                          background: "rgb(var(--paper))",
                          color: "rgb(var(--ink))",
                          border: "1px solid rgb(var(--stone))",
                          fontSize: "15px",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgb(var(--ink))";
                          e.currentTarget.style.color = "rgb(var(--bg))";
                          e.currentTarget.style.borderColor = "rgb(var(--ink))";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgb(var(--paper))";
                          e.currentTarget.style.color = "rgb(var(--ink))";
                          e.currentTarget.style.borderColor = "rgb(var(--stone))";
                        }}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-xs mt-5" style={{ color: "rgb(var(--smoke))" }}>
                  Zeitzone Europe/Berlin · {type.durationMin} Min pro Termin
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// =================== STEP 2: FORMULAR ===================

function FormStep({
  type,
  slot,
  locations,
  dynamicFields,
  dynamicValues,
  setDynamicValues,
  error,
  isPending,
  onBack,
  onSubmit,
}: {
  type: BookingTypeForClient;
  slot: BookableSlot;
  locations: LocationItem[];
  dynamicFields: DynamicField[];
  dynamicValues: Record<string, string>;
  setDynamicValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  error: string | null;
  isPending: boolean;
  onBack: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  function setVal(id: string, val: string) {
    setDynamicValues((prev) => ({ ...prev, [id]: val }));
  }
  return (
    <div className="max-w-2xl mx-auto">
      {/* Summary-Header */}
      <section
        className="card p-6 sm:p-7 mb-6"
        style={{ background: "rgb(var(--accent-soft))", borderColor: "rgb(var(--accent))" }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="eyebrow">Dein Termin</div>
            <h2
              className="font-serif mt-1"
              style={{ fontSize: "26px", color: "rgb(var(--ink))" }}
            >
              {type.name}
            </h2>
            <div className="mt-3 space-y-1.5 text-sm" style={{ color: "rgb(var(--ink))" }}>
              <div className="flex items-center gap-2">
                <CalendarIcon size={14} style={{ color: "rgb(var(--accent))" }} />
                <span className="capitalize">{fmtLongDate(slot.startISO.slice(0, 10))}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: "rgb(var(--accent))" }} />
                {slot.label} Uhr · {type.durationMin} Min
              </div>
              {locations.map((loc) => (
                <div key={loc.key + loc.label} className="flex items-center gap-2">
                  <MapPin size={14} style={{ color: "rgb(var(--accent))" }} />
                  {loc.label}
                </div>
              ))}
              {type.priceCents > 0 && (
                <div className="text-sm mt-2 pt-2 border-t" style={{ borderColor: "rgb(var(--accent))" }}>
                  <span className="eyebrow eyebrow-muted">Preis: </span>
                  <span className="font-serif text-lg tabular-nums">{fmtPrice(type.priceCents)}</span>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="btn-ghost text-xs h-9 shrink-0"
            style={{ color: "rgb(var(--ink))" }}
          >
            <ArrowLeft size={13} /> Anderen Termin wählen
          </button>
        </div>
      </section>

      {/* Form */}
      <section className="card p-6 sm:p-8">
        <div className="mb-6">
          <div className="eyebrow">Deine Daten</div>
          <h3 className="font-serif mt-1" style={{ fontSize: "22px", color: "rgb(var(--ink))" }}>
            Wer bist du?
          </h3>
          <p className="text-sm mt-2" style={{ color: "rgb(var(--smoke))" }}>
            Damit wir uns gut auf dich vorbereiten können.
          </p>
        </div>

        <form
          action={onSubmit}
          className="space-y-5"
        >
          <Field label="Name *">
            <div className="relative">
              <UserIcon
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "rgb(var(--smoke))" }}
              />
              <input
                name="customerName"
                type="text"
                required
                className="input"
                style={{ paddingLeft: 38 }}
                placeholder="Vor- und Nachname"
                autoComplete="name"
              />
            </div>
          </Field>

          <Field label="E-Mail *">
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "rgb(var(--smoke))" }}
              />
              <input
                name="customerEmail"
                type="email"
                required
                className="input"
                style={{ paddingLeft: 38 }}
                placeholder="du@beispiel.de"
                autoComplete="email"
              />
            </div>
          </Field>

          {dynamicFields.map((f) => (
            <DynamicFieldInput
              key={f.id}
              field={f}
              value={dynamicValues[f.id] ?? ""}
              onChange={(v) => setVal(f.id, v)}
            />
          ))}

          {error && (
            <div
              className="rounded-lg border p-4 text-sm flex items-start gap-3"
              style={{
                borderColor: "rgb(var(--accent))",
                background: "rgb(var(--accent-soft))",
                color: "rgb(var(--accent-deep))",
              }}
              role="alert"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="btn-accent flex-1 sm:flex-initial sm:min-w-[260px] h-12 text-base"
              style={{ fontWeight: 500 }}
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Sende …
                </>
              ) : (
                <>Termin verbindlich anfragen</>
              )}
            </button>
            <button
              type="button"
              onClick={onBack}
              disabled={isPending}
              className="btn-secondary h-12 text-base"
            >
              <ArrowLeft size={14} /> Zurück
            </button>
          </div>

          <p className="text-xs pt-3" style={{ color: "rgb(var(--smoke))" }}>
            Mit der Anfrage stimmst du zu, dass deine Daten zur Bearbeitung deiner Buchungsanfrage
            verarbeitet werden.
          </p>
        </form>
      </section>
    </div>
  );
}

// Dynamic-Field-Render-Helper für die öffentliche Buchungsseite.
function DynamicFieldInput({
  field,
  value,
  onChange,
}: {
  field: DynamicField;
  value: string;
  onChange: (v: string) => void;
}) {
  const labelText = `${field.label}${field.required ? " *" : " (optional)"}`;
  const placeholder = field.placeholder ?? "";

  if (field.type === "textarea") {
    return (
      <Field label={labelText}>
        <div className="relative">
          <MessageSquare
            size={16}
            className="absolute left-3 top-3 pointer-events-none"
            style={{ color: "rgb(var(--smoke))" }}
          />
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className="textarea"
            style={{ paddingLeft: 38, minHeight: 110 }}
            placeholder={placeholder}
          />
        </div>
      </Field>
    );
  }
  if (field.type === "select" && field.options && field.options.length > 0) {
    return (
      <Field label={labelText}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="select"
        >
          <option value="">— bitte wählen —</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </Field>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={value === "on"}
          onChange={(e) => onChange(e.target.checked ? "on" : "")}
          className="w-4 h-4"
          required={field.required}
        />
        <span>{field.label}{field.required ? " *" : ""}</span>
      </label>
    );
  }
  // text, phone, email
  const Icon = field.type === "phone" ? Phone : field.type === "email" ? Mail : UserIcon;
  const inputType = field.type === "phone" ? "tel" : field.type === "email" ? "email" : "text";
  return (
    <Field label={labelText}>
      <div className="relative">
        <Icon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "rgb(var(--smoke))" }}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={inputType}
          required={field.required}
          className="input"
          style={{ paddingLeft: 38 }}
          placeholder={placeholder}
          autoComplete={field.type === "phone" ? "tel" : field.type === "email" ? "email" : "off"}
        />
      </div>
    </Field>
  );
}

// =================== STEP 3: CONFIRMATION ===================

function DoneStep({
  type,
  slot,
  firstName,
  studio,
  locations,
  meetingUrl,
  meetingProvider,
}: {
  type: BookingTypeForClient;
  slot: BookableSlot;
  firstName: string;
  studio: Studio;
  locations: LocationItem[];
  meetingUrl: string | null;
  meetingProvider: string | null;
}) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div
        className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: "rgb(var(--accent-soft))" }}
      >
        <CheckCircle2 size={44} style={{ color: "rgb(var(--accent))" }} strokeWidth={1.6} />
      </div>

      <div className="eyebrow">
        {type.autoConfirm ? "Termin bestätigt" : "Anfrage erhalten"}
      </div>
      <h1
        className="font-serif font-medium mt-3 leading-tight"
        style={{ fontSize: "clamp(34px, 5vw, 48px)", color: "rgb(var(--ink))" }}
      >
        Danke{firstName ? <>, <em style={{ color: "rgb(var(--accent))", fontStyle: "italic" }}>{firstName}</em></> : null}!
      </h1>

      <p
        className="mt-5 text-base sm:text-lg leading-relaxed max-w-md mx-auto"
        style={{ color: "rgb(var(--smoke))" }}
      >
        {type.autoConfirm
          ? "Dein Termin ist bestätigt. Du bekommst gleich eine E-Mail mit allen Details."
          : "Wir prüfen deine Anfrage und melden uns innerhalb von 24 Stunden bei dir."}
      </p>

      <section
        className="card p-6 sm:p-7 mt-10 text-left"
        style={{ background: "rgb(var(--paper))" }}
      >
        <div className="eyebrow">Dein Termin</div>
        <div
          className="font-serif mt-1 mb-4"
          style={{ fontSize: "22px", color: "rgb(var(--ink))" }}
        >
          {type.name}
        </div>
        <div className="space-y-2 text-sm" style={{ color: "rgb(var(--ink))" }}>
          <div className="flex items-center gap-2">
            <CalendarIcon size={14} style={{ color: "rgb(var(--accent))" }} />
            <span className="capitalize">{fmtLongDate(slot.startISO.slice(0, 10))}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: "rgb(var(--accent))" }} />
            {slot.label} Uhr · {type.durationMin} Min
          </div>
          {locations.map((loc) => (
            <div key={loc.key + loc.label} className="flex items-center gap-2">
              <MapPin size={14} style={{ color: "rgb(var(--accent))" }} />
              {loc.label}
            </div>
          ))}
        </div>
      </section>

      {/* Online-Meeting-Link */}
      {meetingUrl && (
        <section
          className="card p-6 sm:p-7 mt-6 text-left"
          style={{ borderColor: "rgb(var(--accent))", background: "rgb(var(--accent-soft))" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgb(var(--ink))", color: "rgb(var(--linen))" }}
            >
              <Video size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="eyebrow">{providerLabel(meetingProvider)} Meeting</div>
              <div className="font-serif mt-1" style={{ fontSize: "18px" }}>Dein Meeting-Link</div>
              <a
                href={meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm mt-2 break-all underline hover:no-underline"
                style={{ color: "rgb(var(--accent))" }}
              >
                {meetingUrl}
                <ExternalLink size={12} className="shrink-0" />
              </a>
              <div className="text-xs mt-3" style={{ color: "rgb(var(--smoke))" }}>
                Speichere den Link — wir senden ihn dir auch per E-Mail.
              </div>
            </div>
          </div>
        </section>
      )}

      {(studio?.studioEmail || studio?.studioPhone) && (
        <p className="mt-8 text-sm" style={{ color: "rgb(var(--smoke))" }}>
          Fragen?{" "}
          {studio?.studioEmail && (
            <a
              href={`mailto:${studio.studioEmail}`}
              className="hover:underline"
              style={{ color: "rgb(var(--accent))" }}
            >
              {studio.studioEmail}
            </a>
          )}
          {studio?.studioEmail && studio?.studioPhone && " · "}
          {studio?.studioPhone && (
            <a
              href={`tel:${studio.studioPhone}`}
              className="hover:underline"
              style={{ color: "rgb(var(--accent))" }}
            >
              {studio.studioPhone}
            </a>
          )}
        </p>
      )}
    </div>
  );
}
