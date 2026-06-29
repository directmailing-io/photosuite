"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar, Clock, Mail, Phone, MessageSquare, Check, X, Trash2, ExternalLink, CheckCircle2, XCircle, Video,
} from "lucide-react";
import { toast } from "sonner";
import { acceptBooking, cancelBooking, deleteBooking } from "./actions";

type Booking = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  message: string | null;
  startAt: string;
  endAt: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  shootingId: string | null;
  customerId: string | null;
  meetingUrl: string | null;
  meetingProvider: string | null;
  bookingType: {
    id: string;
    name: string;
    durationMin: number;
    priceCents: number;
    color: string;
    videoProvider: string | null;
  };
};

function providerName(key: string | null): string {
  switch (key) {
    case "zoom": return "Zoom";
    case "google_meet": return "Google Meet";
    case "teams": return "Teams";
    case "whereby": return "Whereby";
    case "manual": return "Manuell";
    default: return "Online";
  }
}

export function BookingInbox({ bookings }: { bookings: Booking[] }) {
  return (
    <ul className="space-y-3">
      {bookings.map((b) => <BookingCard key={b.id} booking={b} />)}
    </ul>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const dateLabel = start.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLabel = `${start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  const isPast = end < new Date();

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

  function onCancel() {
    startTransition(async () => {
      try {
        await cancelBooking(booking.id, cancelReason);
        toast.success("Buchung abgelehnt");
        setCancelOpen(false);
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht ablehnen");
      }
    });
  }

  function onDelete() {
    if (!confirm("Buchung endgültig löschen?")) return;
    startTransition(async () => {
      try {
        await deleteBooking(booking.id);
        toast.success("Gelöscht");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  const statusMeta = STATUS_META[booking.status as keyof typeof STATUS_META] ?? STATUS_META.PENDING;
  const isCancelled = booking.status === "CANCELLED";

  // Bei angenommenen Terminen mit Shooting wird die ganze Card klickbar.
  // Die Aktionen für PENDING-Cards bleiben weiter über Buttons (Annehmen/Ablehnen).
  const cardLink = booking.status === "CONFIRMED" && booking.shootingId
    ? `/shootings/${booking.shootingId}`
    : null;

  return (
    <li
      className="card overflow-hidden relative group"
      style={{ opacity: isCancelled ? 0.6 : 1 }}
    >
      {cardLink && (
        <Link
          href={cardLink}
          aria-label="Zur Shooting-Kartei"
          className="absolute inset-0 z-10 rounded-lg hover:bg-linen/40 transition"
        />
      )}
      <div className="h-1" style={{ background: booking.bookingType.color }} />
      <div className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          {/* Date block */}
          <div className="text-center shrink-0 w-16">
            <div className="text-[10px] uppercase tracking-wider text-smoke">
              {start.toLocaleDateString("de-DE", { month: "short" })}
            </div>
            <div className="font-serif text-3xl leading-none mt-0.5">{start.getDate()}</div>
            <div className="text-[10px] text-smoke mt-1">
              {start.toLocaleDateString("de-DE", { weekday: "short" })}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge" style={{ background: `${statusMeta.color}15`, color: statusMeta.color }}>
                {statusMeta.icon}
                {statusMeta.label}
              </span>
              <span className="text-xs text-smoke">
                {booking.bookingType.name} · {booking.bookingType.durationMin} Min
                {booking.bookingType.priceCents > 0 && ` · ${(booking.bookingType.priceCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`}
              </span>
              {isPast && booking.status === "PENDING" && (
                <span className="text-[10px] uppercase tracking-wider text-taupe">Termin liegt in der Vergangenheit</span>
              )}
            </div>

            <div className="font-medium text-base">{booking.customerName}</div>

            <div className="text-sm text-smoke flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Calendar size={12} /> {dateLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={12} /> {timeLabel}
              </span>
            </div>

            <div className="text-sm text-smoke flex items-center gap-4 flex-wrap relative z-20">
              <a href={`mailto:${booking.customerEmail}`} className="flex items-center gap-1.5 hover:text-ink transition">
                <Mail size={12} /> {booking.customerEmail}
              </a>
              {booking.customerPhone && (
                <a href={`tel:${booking.customerPhone}`} className="flex items-center gap-1.5 hover:text-ink transition">
                  <Phone size={12} /> {booking.customerPhone}
                </a>
              )}
            </div>

            {booking.message && (
              <div className="mt-2 p-3 rounded-lg bg-linen/50 text-sm flex gap-2">
                <MessageSquare size={13} className="text-smoke shrink-0 mt-0.5" />
                <span className="italic" style={{ color: "rgb(var(--ink))" }}>„{booking.message}"</span>
              </div>
            )}

            {/* Online-Meeting-Link */}
            {booking.meetingProvider && booking.meetingUrl && (
              <div className="mt-2 p-3 rounded-lg text-sm flex gap-2 items-start relative z-20" style={{ background: "rgba(120, 167, 119, 0.10)", border: "1px solid rgba(120, 167, 119, 0.3)" }}>
                <Video size={13} className="text-smoke shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-smoke">{providerName(booking.meetingProvider)} Meeting</div>
                  <a
                    href={booking.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline break-all hover:no-underline"
                    style={{ color: "rgb(70, 115, 70)" }}
                  >
                    {booking.meetingUrl}
                  </a>
                </div>
              </div>
            )}
            {booking.bookingType.videoProvider && !booking.meetingUrl && booking.status !== "CANCELLED" && (
              <div className="mt-2 p-3 rounded-lg text-sm flex gap-2 items-start relative z-20" style={{ background: "rgb(var(--accent-soft))", border: "1px solid rgb(var(--accent))" }}>
                <Video size={13} className="shrink-0 mt-0.5" style={{ color: "rgb(var(--accent))" }} />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="font-medium" style={{ color: "rgb(var(--accent))" }}>
                    {providerName(booking.bookingType.videoProvider)}-Link fehlt
                  </div>
                  <div className="text-smoke mt-0.5">
                    Im Buchungstyp ist {providerName(booking.bookingType.videoProvider)} gewählt, aber dein persönlicher Link ist noch nicht hinterlegt.{" "}
                    <a href="/einstellungen?tab=kalender" className="underline hover:text-ink">
                      Jetzt einrichten →
                    </a>
                  </div>
                </div>
              </div>
            )}

            {booking.cancelReason && (
              <div className="text-xs text-smoke mt-2">
                Grund: {booking.cancelReason}
              </div>
            )}
          </div>

          {/* Actions — z-20 damit Klicks nicht zum Card-Link bubblen */}
          <div className="flex flex-col gap-1.5 shrink-0 relative z-20">
            {booking.status === "PENDING" && (
              <>
                <button onClick={onAccept} disabled={pending} className="btn-primary text-xs h-8 whitespace-nowrap">
                  <Check size={13} /> Annehmen
                </button>
                <button onClick={() => setCancelOpen(true)} disabled={pending} className="btn-secondary text-xs h-8 whitespace-nowrap">
                  <X size={13} /> Ablehnen
                </button>
              </>
            )}
            {booking.status === "CONFIRMED" && booking.shootingId && (
              <div className="text-xs text-smoke flex items-center gap-1 whitespace-nowrap pointer-events-none">
                Zur Kartei <ExternalLink size={11} />
              </div>
            )}
            {(booking.status === "CANCELLED" || isPast) && (
              <button onClick={onDelete} disabled={pending} className="btn-ghost text-xs h-8" style={{ color: "rgb(var(--accent))" }}>
                <Trash2 size={13} /> Löschen
              </button>
            )}
          </div>
        </div>
      </div>

      {cancelOpen && (
        <div className="px-5 py-4 border-t border-stone/60 bg-linen/30 space-y-3 relative z-20">
          <label className="text-xs text-smoke">Grund (optional, intern)</label>
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="z.B. Termin nicht verfügbar"
            className="input h-9 text-sm"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setCancelOpen(false)} className="btn-ghost text-sm" disabled={pending}>Abbrechen</button>
            <button onClick={onCancel} className="btn-primary text-sm" disabled={pending} style={{ background: "rgb(var(--accent))" }}>
              Ablehnen
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const STATUS_META = {
  PENDING: { label: "Neu", color: "rgb(80, 130, 80)", icon: <span className="w-1.5 h-1.5 rounded-full bg-current" /> },
  CONFIRMED: { label: "Angenommen", color: "rgb(60, 105, 60)", icon: <CheckCircle2 size={10} /> },
  CANCELLED: { label: "Abgelehnt", color: "rgb(var(--smoke))", icon: <XCircle size={10} /> },
};
