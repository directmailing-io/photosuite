import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { WorkflowEditor } from "./WorkflowEditor";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const [wf, tags] = await Promise.all([
    prisma.workflow.findFirst({
      where: { id, ownerId: userId },
      include: {
        steps: { orderBy: { position: "asc" } },
        runs: {
          orderBy: { triggeredAt: "desc" },
          take: 10,
          include: { jobs: { select: { status: true } } },
        },
      },
    }),
    prisma.tag.findMany({
      where: { ownerId: userId },
      orderBy: { label: "asc" },
      select: { id: true, label: true, color: true },
    }),
  ]);
  if (!wf) return notFound();

  return (
    <>
      <div className="mb-2">
        <Link href="/workflows" className="text-xs text-smoke hover:text-ink flex items-center gap-1">
          <ChevronLeft size={12} /> Zurück zu allen Workflows
        </Link>
      </div>

      <PageHeader eyebrow="Workflow" title={wf.name} subtitle={wf.description ?? undefined} />

      <WorkflowEditor
        workflow={{
          id: wf.id,
          name: wf.name,
          description: wf.description,
          trigger: wf.trigger,
          triggerOffsetDays: wf.triggerOffsetDays,
          isActive: wf.isActive,
          steps: wf.steps.map((s) => ({
            id: s.id,
            position: s.position,
            delayMinutes: s.delayMinutes,
            actionType: s.actionType,
            config: s.config,
          })),
          runs: wf.runs.map((r) => ({
            id: r.id,
            triggeredAt: r.triggeredAt.toISOString(),
            status: r.status,
            jobCount: r.jobs.length,
            doneCount: r.jobs.filter((j) => j.status === "done").length,
            failedCount: r.jobs.filter((j) => j.status === "failed").length,
          })),
        }}
        tags={tags}
      />
    </>
  );
}
