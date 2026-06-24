import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { CalendarView } from "../shootings/CalendarView";
import { getAvailability, findNextFreeDays } from "@/lib/availability";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

function parseMonth(input?: string): { year: number; month: number } {
  if (input) {
    const m = input.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) return { year: y, month: mo };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.month);
  const userId = await requireUserId();

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const calRangeStart = new Date(monthStart); calRangeStart.setDate(calRangeStart.getDate() - 7);
  const calRangeEnd = new Date(monthEnd); calRangeEnd.setDate(calRangeEnd.getDate() + 7);

  const [shootings, customers, packages, externalEvents, availabilityDays, nextFreeDays, calendarBookings] = await Promise.all([
    prisma.shooting.findMany({
      where: { ownerId: userId, scheduledAt: { gte: calRangeStart, lt: calRangeEnd } },
      include: { customer: true, package: true, status: true },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.customer.findMany({
      where: { ownerId: userId },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.package.findMany({
      where: { ownerId: userId, isActive: true },
      select: { id: true, name: true, price: true, durationMin: true, bookingBufferBeforeMin: true, bookingBufferAfterMin: true },
      orderBy: { position: "asc" },
    }),
    prisma.externalCalendarEvent.findMany({
      where: {
        connection: { userId, syncEnabled: true, status: "active" },
        startAt: { gte: calRangeStart },
        endAt: { lt: calRangeEnd },
        isOurs: false,
      },
      include: { connection: { select: { provider: true } } },
      orderBy: { startAt: "asc" },
    }),
    getAvailability(userId, calRangeStart, calRangeEnd),
    findNextFreeDays(userId, new Date(), 10, 90),
    // Online-Buchungen ohne Shooting (PENDING + CONFIRMED) im Range —
    // damit Lisa sieht, dass da Anfragen liegen, bevor sie annimmt.
    prisma.booking.findMany({
      where: {
        ownerId: userId,
        status: { not: "CANCELLED" },
        shootingId: null,
        startAt: { gte: calRangeStart, lt: calRangeEnd },
      },
      include: { bookingType: { select: { name: true, color: true } } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Termine"
        title="Kalender"
        subtitle="Verfügbarkeit auf einen Blick — direkt im Kalender markieren oder Termin anlegen."
      >
        <Link href="/einstellungen?tab=kalender" className="btn-secondary">
          <Settings size={14} /> Verfügbarkeit konfigurieren
        </Link>
      </PageHeader>

      <CalendarView
        year={year}
        month={month}
        customers={customers}
        packages={packages}
        availability={availabilityDays}
        nextFreeDays={nextFreeDays}
        bookings={calendarBookings.map((b) => ({
          id: b.id,
          customerName: b.customerName,
          customerEmail: b.customerEmail,
          startAt: b.startAt.toISOString(),
          endAt: b.endAt.toISOString(),
          status: b.status as "PENDING" | "CONFIRMED",
          bookingTypeName: b.bookingType.name,
          bookingTypeColor: b.bookingType.color,
          meetingUrl: b.meetingUrl,
          meetingProvider: b.meetingProvider,
        }))}
        externalEvents={externalEvents.map((e) => ({
          id: e.id,
          startAt: e.startAt.toISOString(),
          endAt: e.endAt.toISOString(),
          summary: e.summary,
          provider: e.connection.provider,
        }))}
        shootings={shootings
          .filter((s): s is typeof s & { scheduledAt: Date } => !!s.scheduledAt)
          .map((s) => ({
            id: s.id,
            title: s.title,
            scheduledAt: s.scheduledAt.toISOString(),
            durationMin: s.durationMin,
            location: s.location,
            price: s.price,
            customerId: s.customer.id,
            customerFirstName: s.customer.firstName,
            customerLastName: s.customer.lastName,
            customerAvatarUrl: s.customer.avatarUrl,
            statusLabel: s.status?.label ?? null,
            statusColor: s.status?.color ?? null,
            packageName: s.package?.name ?? null,
          }))}
        basePath="/kalender"
      />
    </>
  );
}
