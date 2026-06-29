import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CheckSquare, Calendar, ListChecks, Workflow } from "lucide-react";
import { NewTaskForm, FlatTaskList, type FlatTaskItem } from "./TaskComponents";

export const dynamic = "force-dynamic";

/**
 * Aufgaben-Page mit Flat-Liste (nach Fälligkeit sortiert).
 *
 * Sammelt 2 Quellen in eine einheitliche Liste:
 *   - Task: freie To-Dos (mit optionalem Customer-/Shooting-Bezug)
 *   - ChecklistItem: internal-Shooting-Checklisten (Audience=INTERNAL)
 *
 * Pro Eintrag wird das Shooting als anklickbarer „Tag" gerendert — nicht mehr
 * als Gruppierungs-Header. Das fokussiert auf die zeitliche Reihenfolge.
 *
 * Erledigte Einträge sind unten in einer collapsiblen Sektion.
 */
export default async function AufgabenPage() {
  const userId = await requireUserId();
  const [tasks, customers, checklists] = await Promise.all([
    prisma.task.findMany({
      where: { ownerId: userId },
      include: { customer: true, shooting: true },
    }),
    prisma.customer.findMany({ where: { ownerId: userId }, orderBy: { firstName: "asc" } }),
    prisma.checklist.findMany({
      where: {
        audience: "INTERNAL",
        shooting: { ownerId: userId },
      },
      include: {
        items: true,
        shooting: { select: { id: true, title: true } },
      },
    }),
  ]);

  // Beide Quellen in ein einheitliches Item-Format mappen
  const items: FlatTaskItem[] = [];
  for (const t of tasks) {
    items.push({
      id: `task:${t.id}`,
      sourceKind: "task",
      sourceId: t.id,
      shootingId: null,
      checklistId: null,
      title: t.title,
      description: t.description,
      done: t.done,
      dueAt: t.dueAt?.toISOString() ?? null,
      customer: t.customer ? { id: t.customer.id, name: `${t.customer.firstName} ${t.customer.lastName}` } : null,
      shooting: t.shooting ? { id: t.shooting.id, title: t.shooting.title } : null,
    });
  }
  for (const cl of checklists) {
    for (const it of cl.items) {
      items.push({
        id: `cl:${it.id}`,
        sourceKind: "checklist",
        sourceId: it.id,
        shootingId: cl.shooting.id,
        checklistId: cl.id,
        title: it.label,
        description: null,
        done: it.done,
        dueAt: it.dueAt?.toISOString() ?? null,
        customer: null,
        shooting: { id: cl.shooting.id, title: cl.shooting.title },
      });
    }
  }

  // Sortierung: nicht-fertig zuerst, dann nach Fälligkeit (frühestes oben),
  // dann nach Title.
  function dueTime(item: FlatTaskItem): number {
    if (!item.dueAt) return Number.MAX_SAFE_INTEGER;
    return new Date(item.dueAt).getTime();
  }
  const open = items.filter((i) => !i.done).sort((a, b) => dueTime(a) - dueTime(b));
  const done = items.filter((i) => i.done).sort((a, b) => dueTime(b) - dueTime(a)); // erledigte: jüngste zuerst

  const now = Date.now();
  const overdue = open.filter((i) => i.dueAt && new Date(i.dueAt).getTime() < now).length;
  const totalOpen = open.length;
  const checklistOpen = open.filter((i) => i.sourceKind === "checklist").length;

  return (
    <>
      <PageHeader
        eyebrow="Was steht an"
        title="Aufgaben"
        subtitle="Alles, was du noch erledigen willst — sortiert nach Datum."
      >
        <Link href="/einstellungen?tab=workflows" className="btn-secondary">
          <Workflow size={15} /> Workflows
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <KPI label="Offen gesamt" value={String(totalOpen)} sub="To-dos + Checklisten-Items" icon={<CheckSquare size={15} />} />
        <KPI label="Aus Checklisten" value={String(checklistOpen)} sub="Aus Shooting-Vorlagen" icon={<ListChecks size={15} />} />
        <KPI label="Überfällig" value={String(overdue)} sub="Mit verstrichener Deadline" icon={<Calendar size={15} />} accent={overdue > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {open.length === 0 ? (
            <EmptyState
              icon={<CheckSquare size={36} strokeWidth={1.25} />}
              title="Alles aufgeräumt"
              description="Keine offenen Aufgaben."
            />
          ) : (
            <section className="card">
              <div className="px-5 py-3 border-b border-stone/60 flex items-center justify-between">
                <div className="eyebrow eyebrow-muted">Offen — nach Fälligkeit</div>
                <div className="text-xs text-smoke">{open.length}</div>
              </div>
              <FlatTaskList items={open} />
            </section>
          )}

          {done.length > 0 && (
            <details className="card">
              <summary className="px-5 py-3 border-b border-stone/60 flex items-center justify-between cursor-pointer list-none">
                <div className="eyebrow eyebrow-muted">Erledigt</div>
                <div className="text-xs text-smoke">{done.length}</div>
              </summary>
              <FlatTaskList items={done} />
            </details>
          )}
        </div>

        <aside>
          <div className="card p-5 sticky top-6">
            <div className="eyebrow mb-4 eyebrow-muted">Neue Aufgabe</div>
            <NewTaskForm customers={customers.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }))} />
          </div>
        </aside>
      </div>
    </>
  );
}

function KPI({ label, value, sub, icon, accent }: { label: string; value: string; sub: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-smoke">{icon}<div className="eyebrow eyebrow-muted">{label}</div></div>
      <div className="font-serif text-3xl mt-2 tabular-nums" style={{ color: accent ? "rgb(var(--accent))" : undefined }}>{value}</div>
      <div className="text-xs text-smoke mt-1">{sub}</div>
    </div>
  );
}
