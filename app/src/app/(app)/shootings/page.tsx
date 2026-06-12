import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar } from "@/components/Avatar";
import { Camera, Plus, LayoutGrid, List, MapPin, CalendarDays, Calendar } from "lucide-react";
import { formatDateTime, formatEUR, cn } from "@/lib/utils";
import { KanbanBoard } from "./KanbanBoard";
import { CalendarView } from "./CalendarView";
import { getAvailability, findNextFreeDays } from "@/lib/availability";

export const dynamic = "force-dynamic";

type View = "table" | "kanban" | "calendar";

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

export default async function ShootingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; status?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const view: View = sp.view === "kanban" ? "kanban" : sp.view === "calendar" ? "calendar" : "table";
  const statusFilter = sp.status;
  const { year, month } = parseMonth(sp.month);

  const [shootings, statuses, customers, packages] = await Promise.all([
    prisma.shooting.findMany({
      where: statusFilter ? { statusId: statusFilter } : undefined,
      include: { customer: true, package: true, status: true },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.shootingStatus.findMany({ orderBy: { position: "asc" } }),
    // Für Quick-Create im Kalender
    view === "calendar"
      ? prisma.customer.findMany({ select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })
      : Promise.resolve([]),
    view === "calendar"
      ? prisma.package.findMany({ where: { isActive: true }, select: { id: true, name: true, price: true, durationMin: true }, orderBy: { position: "asc" } })
      : Promise.resolve([]),
  ]);

  // Externe Kalender-Events im Kalender-Monat (für Konflikt-Anzeige)
  const externalEvents = view === "calendar"
    ? await prisma.externalCalendarEvent.findMany({
        where: {
          connection: { syncEnabled: true, status: "active" },
          startAt: { gte: new Date(year, month - 1, 1) },
          endAt: { lt: new Date(year, month, 1) },
          isOurs: false, // unsere eigenen Shootings nicht doppelt anzeigen
        },
        include: { connection: { select: { provider: true } } },
        orderBy: { startAt: "asc" },
      })
    : [];

  // Für die Kalender-Ansicht: das 6-Wochen-Grid umspannt den Monat plus Overflow.
  // Wir filtern grob auf den Monat ± 7 Tage — das reicht für maximalen Grid-Überhang.
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const calRangeStart = new Date(monthStart); calRangeStart.setDate(calRangeStart.getDate() - 7);
  const calRangeEnd = new Date(monthEnd); calRangeEnd.setDate(calRangeEnd.getDate() + 7);
  const calendarShootings = shootings.filter(
    (s) => s.scheduledAt && s.scheduledAt >= calRangeStart && s.scheduledAt < calRangeEnd,
  );

  // Verfügbarkeit fürs angezeigte Grid + nächste freie Tage für den „Freie Termine"-Panel
  const [availabilityDays, nextFreeDays] = view === "calendar"
    ? await Promise.all([
        getAvailability(calRangeStart, calRangeEnd),
        findNextFreeDays(new Date(), 10, 90),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        eyebrow="Dein Kalender"
        title="Shootings"
        subtitle="Alles, was geplant, gebucht oder erledigt ist."
      >
        <div className="flex items-center gap-1 bg-paper border border-stone rounded-lg p-1">
          <Link href="?view=table" title="Tabelle" className={cn("btn-icon", view === "table" && "bg-linen text-ink")}><List size={16} /></Link>
          <Link href="?view=kanban" title="Kanban" className={cn("btn-icon", view === "kanban" && "bg-linen text-ink")}><LayoutGrid size={16} /></Link>
          <Link href="?view=calendar" title="Kalender" className={cn("btn-icon", view === "calendar" && "bg-linen text-ink")}><Calendar size={16} /></Link>
        </div>
        <Link href="/shootings/neu" className="btn-accent">
          <Plus size={16} /> Neues Shooting
        </Link>
      </PageHeader>

      {shootings.length === 0 && !statusFilter ? (
        <EmptyState
          icon={<Camera size={36} strokeWidth={1.25} />}
          title="Noch kein Shooting geplant"
          description="Lege dein erstes Shooting an und ordne ihm eine Kundin und ein Paket zu."
          action={
            <Link href="/shootings/neu" className="btn-accent">
              <Plus size={16} /> Erstes Shooting anlegen
            </Link>
          }
        />
      ) : view === "kanban" ? (
        <KanbanBoard
          statuses={statuses}
          shootings={shootings.map((s) => ({
            id: s.id,
            title: s.title,
            statusId: s.statusId,
            price: s.price,
            scheduledAt: s.scheduledAt ? s.scheduledAt.toISOString() : null,
            location: s.location,
            customerName: `${s.customer.firstName} ${s.customer.lastName}`,
            customerAvatarUrl: s.customer.avatarUrl,
            packageName: s.package?.name ?? null,
            kanbanPosition: s.kanbanPosition,
          }))}
        />
      ) : view === "calendar" ? (
        <CalendarView
          year={year}
          month={month}
          customers={customers}
          packages={packages}
          availability={availabilityDays}
          nextFreeDays={nextFreeDays}
          externalEvents={externalEvents.map((e) => ({
            id: e.id,
            startAt: e.startAt.toISOString(),
            endAt: e.endAt.toISOString(),
            summary: e.summary,
            provider: e.connection.provider,
          }))}
          shootings={calendarShootings
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
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Shooting</th>
                <th className="table-th">Kundin</th>
                <th className="table-th">Termin</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Preis</th>
              </tr>
            </thead>
            <tbody>
              {shootings.map((s) => (
                <tr key={s.id} className="table-row">
                  <td className="table-td">
                    <Link href={`/shootings/${s.id}`} className="block">
                      <div className="font-medium hover:underline">{s.title}</div>
                      {s.package && <div className="text-xs text-smoke mt-0.5">{s.package.name}</div>}
                    </Link>
                  </td>
                  <td className="table-td">
                    <Link href={`/kunden/${s.customer.id}`} className="flex items-center gap-2 hover:underline">
                      <Avatar url={s.customer.avatarUrl} firstName={s.customer.firstName} lastName={s.customer.lastName} size={28} />
                      <span className="text-sm">{s.customer.firstName} {s.customer.lastName}</span>
                    </Link>
                  </td>
                  <td className="table-td text-sm">
                    <div className="flex items-center gap-1.5"><CalendarDays size={13} className="text-smoke" /> {formatDateTime(s.scheduledAt)}</div>
                    {s.location && (
                      <div className="flex items-center gap-1.5 text-xs text-smoke mt-1"><MapPin size={12} /> {s.location}</div>
                    )}
                  </td>
                  <td className="table-td">
                    {s.status && <StatusBadge label={s.status.label} color={s.status.color} />}
                  </td>
                  <td className="table-td text-right tabular-nums font-medium">{formatEUR(s.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
