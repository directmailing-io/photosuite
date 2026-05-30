import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CheckSquare, Calendar, ListChecks, Briefcase } from "lucide-react";
import { TaskList, NewTaskForm, ChecklistRowGroup } from "./TaskComponents";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AufgabenPage() {
  const [tasks, customers, shootings] = await Promise.all([
    prisma.task.findMany({
      include: { customer: true, shooting: true },
      orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    }),
    prisma.customer.findMany({ orderBy: { firstName: "asc" } }),
    prisma.shooting.findMany({
      where: {
        checklists: {
          some: {
            audience: "INTERNAL",
            items: { some: {} },
          },
        },
      },
      include: {
        customer: true,
        status: true,
        dates: { orderBy: { startAt: "asc" }, take: 1 },
        checklists: {
          where: { audience: "INTERNAL" },
          orderBy: { position: "asc" },
          include: {
            items: { orderBy: [{ done: "asc" }, { dueAt: "asc" }, { position: "asc" }] },
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  // Sortiere Shootings nach erstem Termin oder scheduledAt
  const shootingsSorted = [...shootings].sort((a, b) => {
    const at = a.dates[0]?.startAt?.getTime() ?? a.scheduledAt?.getTime() ?? Infinity;
    const bt = b.dates[0]?.startAt?.getTime() ?? b.scheduledAt?.getTime() ?? Infinity;
    return at - bt;
  });

  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  // Anzahl offene Checklist-Items
  const openChecklistItems = shootingsSorted.reduce(
    (sum, s) => sum + s.checklists.reduce((cs, c) => cs + c.items.filter((i) => !i.done).length, 0),
    0,
  );
  const overdueCount = shootingsSorted.reduce(
    (sum, s) => sum + s.checklists.reduce(
      (cs, c) => cs + c.items.filter((i) => !i.done && i.dueAt && i.dueAt < new Date()).length, 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Was steht an"
        title="Aufgaben"
        subtitle="Alle internen Checklisten-Punkte aus deinen Shootings, plus freie To-dos."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <KPI label="Offene To-dos" value={String(openTasks.length)} sub="Freie Aufgaben" icon={<CheckSquare size={15} />} />
        <KPI label="Offene Punkte" value={String(openChecklistItems)} sub="Aus Shooting-Checklisten" icon={<ListChecks size={15} />} />
        <KPI label="Überfällig" value={String(overdueCount)} sub="Mit Deadline" icon={<Calendar size={15} />} accent={overdueCount > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Shooting-Checklisten */}
          {shootingsSorted.length === 0 && openTasks.length === 0 ? (
            <EmptyState
              icon={<CheckSquare size={36} strokeWidth={1.25} />}
              title="Alles aufgeräumt"
              description="Keine offenen Aufgaben aus Shootings, keine freien To-dos."
            />
          ) : (
            <>
              {shootingsSorted.length > 0 && (
                <section className="card">
                  <div className="px-5 py-3 border-b border-stone/60 flex items-center justify-between">
                    <div className="eyebrow eyebrow-muted flex items-center gap-2"><Briefcase size={13} /> Pro Shooting</div>
                  </div>
                  <div className="divide-y divide-stone/60">
                    {shootingsSorted.map((s) => {
                      const open = s.checklists.reduce((cs, c) => cs + c.items.filter((i) => !i.done).length, 0);
                      const total = s.checklists.reduce((cs, c) => cs + c.items.length, 0);
                      const nextDate = s.dates[0]?.startAt ?? s.scheduledAt;
                      return (
                        <details key={s.id} open={open > 0} className="px-5 py-4 group">
                          <summary className="flex items-center justify-between cursor-pointer list-none">
                            <div className="flex-1 min-w-0">
                              <Link href={`/shootings/${s.id}`} className="font-medium text-sm hover:underline">
                                {s.title}
                              </Link>
                              <div className="text-xs text-smoke mt-0.5 flex items-center gap-2">
                                <span>{s.customer.firstName} {s.customer.lastName}</span>
                                {nextDate && <span>· {formatDateTime(nextDate)}</span>}
                                {s.status && <StatusBadge label={s.status.label} color={s.status.color} />}
                              </div>
                            </div>
                            <div className="text-xs text-smoke tabular-nums ml-3">{open}/{total} offen</div>
                          </summary>
                          <div className="mt-3 space-y-4">
                            {s.checklists.map((cl) => (
                              <ChecklistRowGroup
                                key={cl.id}
                                shootingId={s.id}
                                checklist={{
                                  id: cl.id,
                                  title: cl.title,
                                  items: cl.items.map((i) => ({
                                    id: i.id,
                                    label: i.label,
                                    done: i.done,
                                    dueAt: i.dueAt?.toISOString() ?? null,
                                  })),
                                }}
                              />
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </section>
              )}

              {openTasks.length > 0 && (
                <section className="card">
                  <div className="px-5 py-3 border-b border-stone/60 flex items-center justify-between">
                    <div className="eyebrow eyebrow-muted">Freie To-dos</div>
                    <div className="text-xs text-smoke">{openTasks.length}</div>
                  </div>
                  <TaskList tasks={openTasks.map(serializeTask)} />
                </section>
              )}

              {doneTasks.length > 0 && (
                <section className="card">
                  <div className="px-5 py-3 border-b border-stone/60 flex items-center justify-between">
                    <div className="eyebrow eyebrow-muted">Erledigt</div>
                    <div className="text-xs text-smoke">{doneTasks.length}</div>
                  </div>
                  <TaskList tasks={doneTasks.map(serializeTask)} />
                </section>
              )}
            </>
          )}
        </div>

        <div>
          <div className="card p-5 sticky top-6">
            <div className="eyebrow mb-4 eyebrow-muted">Neue freie Aufgabe</div>
            <NewTaskForm customers={customers.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))} />
          </div>
        </div>
      </div>
    </>
  );
}

function KPI({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-smoke">{icon}<div className="eyebrow eyebrow-muted">{label}</div></div>
      <div className="font-serif text-3xl mt-2 tabular-nums" style={{ color: accent ? "var(--accent)" : undefined }}>{value}</div>
      <div className="text-xs text-smoke mt-1">{sub}</div>
    </div>
  );
}

function serializeTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    done: t.done,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    customer: t.customer ? { id: t.customer.id, name: `${t.customer.firstName} ${t.customer.lastName}` } : null,
    shooting: t.shooting ? { id: t.shooting.id, title: t.shooting.title } : null,
  };
}
