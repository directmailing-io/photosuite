import { prisma } from "@/lib/prisma";
import type { ManualWorkflowOption, RunHistoryItem } from "@/components/WorkflowSection";

/**
 * Lädt alle aktiven manuellen Workflows + die letzten 8 Runs für einen Kontext
 * (Shooting oder Kunde). Wird im Shooting- und Kunden-Detail genutzt.
 *
 * Filter:
 *  - manualWorkflows: alle aktiven Workflows mit Trigger "manual" des Users
 *  - runs: WHERE (shootingId IF given) OR (customerId IF given) — also alles,
 *    was an diesem Kontext hängt
 */
export async function loadWorkflowSectionData(
  userId: string,
  ctx: { customerId?: string | null; shootingId?: string | null },
): Promise<{ manualWorkflows: ManualWorkflowOption[]; runs: RunHistoryItem[] }> {
  const [manualWorkflows, rawRuns] = await Promise.all([
    prisma.workflow.findMany({
      where: { ownerId: userId, trigger: "manual", isActive: true },
      select: { id: true, name: true, description: true },
      orderBy: { name: "asc" },
    }),
    prisma.workflowRun.findMany({
      where: {
        ownerId: userId,
        OR: [
          ctx.shootingId ? { shootingId: ctx.shootingId } : { id: "__never__" },
          ctx.customerId ? { customerId: ctx.customerId } : { id: "__never__" },
        ].filter((c) => !("id" in c && c.id === "__never__")) as any,
      },
      include: {
        workflow: { select: { id: true, name: true, trigger: true } },
        jobs: { select: { status: true, runAt: true }, orderBy: { runAt: "asc" } },
      },
      orderBy: { triggeredAt: "desc" },
      take: 8,
    }),
  ]);

  const runs: RunHistoryItem[] = rawRuns.map((r) => {
    const total = r.jobs.length;
    const done = r.jobs.filter((j) => j.status === "done").length;
    // Nächste anstehende Job-Ausführung anzeigen (nur bei pending Runs hilfreich)
    const nextPending = r.jobs.find((j) => j.status === "pending");
    return {
      id: r.id,
      workflowId: r.workflow.id,
      workflowName: r.workflow.name,
      trigger: r.workflow.trigger,
      triggeredAt: r.triggeredAt.toISOString(),
      status: r.status,
      jobsDone: done,
      jobsTotal: total,
      nextRunAt: nextPending?.runAt.toISOString() ?? null,
    };
  });

  return { manualWorkflows, runs };
}
