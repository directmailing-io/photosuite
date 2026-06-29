import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CalendarCheck, Inbox, Settings, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingInbox } from "./BookingInbox";

export const dynamic = "force-dynamic";

type Filter = "pending" | "all" | "confirmed" | "cancelled";
const VALID_FILTERS: Filter[] = ["pending", "all", "confirmed", "cancelled"];

export default async function BuchungenPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter: Filter = (VALID_FILTERS.includes(sp.filter as Filter) ? sp.filter : "pending") as Filter;
  const userId = await requireUserId();

  const baseWhere = { ownerId: userId };
  const statusWhere = filter === "all"
    ? baseWhere
    : filter === "pending"
      ? { ...baseWhere, status: "PENDING" }
      : filter === "confirmed"
        ? { ...baseWhere, status: "CONFIRMED" }
        : { ...baseWhere, status: "CANCELLED" };

  const [bookings, counts, types] = await Promise.all([
    prisma.booking.findMany({
      where: statusWhere,
      include: { bookingType: true, customer: true, shooting: true },
      orderBy: [{ status: "asc" }, { startAt: "asc" }],
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: { ownerId: userId },
      _count: { _all: true },
    }),
    prisma.bookingType.findMany({
      where: { ownerId: userId, isActive: true },
      orderBy: { position: "asc" },
    }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number>;
  const totalAll = (countByStatus.PENDING ?? 0) + (countByStatus.CONFIRMED ?? 0) + (countByStatus.CANCELLED ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Termine"
        subtitle="Termin-Anfragen von deinem öffentlichen Buchungslink — annehmen wird automatisch zu Kundin und Shooting."
      >
        <Link href="/einstellungen?tab=buchung" className="btn-secondary">
          <Settings size={14} /> Buchungstypen verwalten
        </Link>
      </PageHeader>

      {/* Filter-Tabs als sichtbare graue Pills */}
      <div className="flex flex-wrap gap-2 mb-6 text-xs">
        <FilterTab href="/buchungen?filter=pending" label="Neu" active={filter === "pending"} count={countByStatus.PENDING ?? 0} highlight />
        <FilterTab href="/buchungen?filter=confirmed" label="Angenommen" active={filter === "confirmed"} count={countByStatus.CONFIRMED ?? 0} />
        <FilterTab href="/buchungen?filter=cancelled" label="Abgelehnt" active={filter === "cancelled"} count={countByStatus.CANCELLED ?? 0} />
        <FilterTab href="/buchungen?filter=all" label="Alle" active={filter === "all"} count={totalAll} />
      </div>

      {bookings.length === 0 ? (
        totalAll === 0 ? (
          <EmptyState
            icon={<Inbox size={36} strokeWidth={1.25} />}
            title="Noch keine Termine"
            description={
              types.length === 0
                ? 'Lege zuerst einen Buchungstyp an — z.B. „Erstgespräch 30 Min kostenlos".'
                : "Sobald jemand über deinen Link einen Termin bucht, taucht die Anfrage hier auf."
            }
            action={
              types.length === 0 ? (
                <Link href="/einstellungen?tab=buchung" className="btn-accent">
                  <CalendarCheck size={16} /> Buchungstyp anlegen
                </Link>
              ) : (
                <Link href={`/b/${types[0].slug}`} target="_blank" className="btn-secondary">
                  <ExternalLink size={14} /> Buchungsseite ansehen
                </Link>
              )
            }
          />
        ) : (
          <div className="card p-12 text-center text-sm text-smoke">
            Keine Termine in diesem Filter.
          </div>
        )
      ) : (
        <BookingInbox
          bookings={bookings.map((b) => ({
            id: b.id,
            customerName: b.customerName,
            customerEmail: b.customerEmail,
            customerPhone: b.customerPhone,
            message: b.message,
            startAt: b.startAt.toISOString(),
            endAt: b.endAt.toISOString(),
            status: b.status,
            createdAt: b.createdAt.toISOString(),
            confirmedAt: b.confirmedAt?.toISOString() ?? null,
            cancelledAt: b.cancelledAt?.toISOString() ?? null,
            cancelReason: b.cancelReason,
            shootingId: b.shootingId,
            customerId: b.customerId,
            meetingUrl: b.meetingUrl,
            meetingProvider: b.meetingProvider,
            bookingType: {
              id: b.bookingType.id,
              name: b.bookingType.name,
              durationMin: b.bookingType.durationMin,
              priceCents: b.bookingType.priceCents,
              color: b.bookingType.color,
              videoProvider: b.bookingType.videoProvider,
            },
          }))}
        />
      )}
    </>
  );
}

function FilterTab({
  href, label, active, count, highlight,
}: {
  href: string; label: string; active: boolean; count: number; highlight?: boolean;
}) {
  // Pills: aktive = dunkler Ink-Background, inaktive = grau-umrandet (sichtbar).
  // „Neu" mit highlight: rote Punkt-Indikator, wenn Anfragen offen sind und Tab nicht aktiv.
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border transition",
        active
          ? "bg-ink text-paper border-ink"
          : "border-stone bg-paper hover:bg-linen text-ink",
      )}
    >
      <span>{label}</span>
      {count > 0 && (
        <span
          className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-medium"
          style={{
            background: highlight && !active
              ? "rgb(var(--accent))"
              : active ? "rgba(255,255,255,0.18)" : "rgb(var(--linen))",
            color: highlight && !active
              ? "#fff"
              : active ? "rgb(var(--paper))" : "rgb(var(--smoke))",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
