"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_TRIGGERS = new Set([
  "invoice_paid",
  "offer_accepted",
  "lead_created",
  "booking_accepted",
  "shooting_before",
  "shooting_after",
  "manual",
]);
const TIME_TRIGGER_SET = new Set(["shooting_before", "shooting_after"]);
const VALID_ACTIONS = new Set(["email", "task"]);

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function n(v: FormDataEntryValue | null): number {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

/**
 * Erstellt einen leeren Workflow und leitet auf den Editor weiter.
 */
export async function createWorkflow(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const name = s(formData.get("name"));
  if (!name) throw new Error("Name darf nicht leer sein.");
  const trigger = String(formData.get("trigger") ?? "manual");
  if (!VALID_TRIGGERS.has(trigger)) throw new Error("Ungültiger Trigger.");

  const wf = await prisma.workflow.create({
    data: {
      name: name.slice(0, 200),
      description: s(formData.get("description")),
      trigger,
      isActive: true,
      ownerId: userId,
    },
  });
  revalidatePath("/workflows");
  redirect(`/workflows/${wf.id}`);
}

export async function updateWorkflow(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const wf = await prisma.workflow.findFirst({ where: { id, ownerId: userId } });
  if (!wf) throw new Error("Workflow nicht gefunden");

  const name = s(formData.get("name"));
  if (!name) throw new Error("Name darf nicht leer sein.");
  const trigger = String(formData.get("trigger") ?? wf.trigger);
  if (!VALID_TRIGGERS.has(trigger)) throw new Error("Ungültiger Trigger.");
  // Offset nur bei zeitbasierten Triggern relevant; sonst auf 0 zwingen.
  const rawOffset = Math.round(n(formData.get("triggerOffsetDays")));
  const triggerOffsetDays = TIME_TRIGGER_SET.has(trigger)
    ? Math.max(0, rawOffset)
    : 0;

  await prisma.workflow.update({
    where: { id },
    data: {
      name: name.slice(0, 200),
      description: s(formData.get("description")),
      trigger,
      triggerOffsetDays,
    },
  });
  // Bei Trigger- oder Offset-Wechsel zeitbasierte Planung neu rollen.
  const triggerChanged = wf.trigger !== trigger || wf.triggerOffsetDays !== triggerOffsetDays;
  if (triggerChanged && (TIME_TRIGGER_SET.has(trigger) || TIME_TRIGGER_SET.has(wf.trigger))) {
    await rescheduleForWorkflow(id, userId);
  }
  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

export async function toggleWorkflowActive(id: string, isActive: boolean): Promise<void> {
  const userId = await requireUserId();
  const wf = await prisma.workflow.findFirst({ where: { id, ownerId: userId } });
  if (!wf) throw new Error("Workflow nicht gefunden");
  await prisma.workflow.update({ where: { id }, data: { isActive } });
  // Bei zeitbasierten Triggern: Aktivieren → für alle zukünftigen Shootings planen,
  // Deaktivieren → offene Runs für diesen Workflow cancellen.
  if (TIME_TRIGGER_SET.has(wf.trigger)) {
    await rescheduleForWorkflow(id, userId);
  }
  revalidatePath("/workflows");
  revalidatePath(`/workflows/${id}`);
}

/**
 * Hilfsfunktion: für einen zeitbasierten Workflow alle offenen Runs cancellen
 * und neu für alle zukünftigen Shootings mit scheduledAt planen.
 */
async function rescheduleForWorkflow(workflowId: string, ownerId: string): Promise<void> {
  // Erst alle offenen Runs für diesen Workflow cancellen.
  const openRuns = await prisma.workflowRun.findMany({
    where: { workflowId, status: "pending" },
    select: { id: true },
  });
  if (openRuns.length > 0) {
    const ids = openRuns.map((r) => r.id);
    await prisma.workflowJob.updateMany({
      where: { runId: { in: ids }, status: "pending" },
      data: { status: "cancelled" },
    });
    await prisma.workflowRun.updateMany({
      where: { id: { in: ids } },
      data: { status: "cancelled" },
    });
  }
  // Workflow neu laden + nur wenn aktiv + zeitbasiert: alle zukünftigen
  // Shootings durchgehen und neu planen.
  const wf = await prisma.workflow.findFirst({ where: { id: workflowId, ownerId } });
  if (!wf || !wf.isActive || !TIME_TRIGGER_SET.has(wf.trigger)) return;
  const futureShootings = await prisma.shooting.findMany({
    where: { ownerId, scheduledAt: { gte: new Date() } },
    select: { id: true },
  });
  const { scheduleShootingWorkflows } = await import("@/lib/workflow/engine");
  for (const sh of futureShootings) {
    await scheduleShootingWorkflows(sh.id);
  }
}

export async function deleteWorkflow(id: string): Promise<void> {
  const userId = await requireUserId();
  const wf = await prisma.workflow.findFirst({ where: { id, ownerId: userId } });
  if (!wf) throw new Error("Workflow nicht gefunden");
  await prisma.workflow.delete({ where: { id } });
  revalidatePath("/workflows");
  // KEIN server-side redirect mehr — der NEXT_REDIRECT-Throw verursachte einen
  // Client-Side-Crash, weil die Page noch versuchte, sich mit den alten
  // (jetzt verschwundenen) Workflow-Daten zu re-rendern. Der Client navigiert
  // jetzt nach erfolgreichem Delete selbst per router.push.
}

/**
 * Fügt einen neuen Step (Email oder Task) hinzu. Position ans Ende.
 */
export async function addWorkflowStep(workflowId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const wf = await prisma.workflow.findFirst({ where: { id: workflowId, ownerId: userId } });
  if (!wf) throw new Error("Workflow nicht gefunden");

  const actionType = String(formData.get("actionType"));
  if (!VALID_ACTIONS.has(actionType)) throw new Error("Ungültiger Action-Typ.");

  let config: any;
  if (actionType === "email") {
    const to = String(formData.get("to") ?? "customer");
    if (to !== "customer" && to !== "owner") throw new Error("Empfänger muss customer oder owner sein.");
    const subject = s(formData.get("subject"));
    const body = s(formData.get("body"));
    if (!subject || !body) throw new Error("Betreff und Text dürfen nicht leer sein.");
    config = { to, subject: subject.slice(0, 200), body: body.slice(0, 10_000) };
  } else {
    const title = s(formData.get("title"));
    if (!title) throw new Error("Aufgabentitel darf nicht leer sein.");
    const description = s(formData.get("description"));
    const dueInDays = Math.max(0, Math.round(n(formData.get("dueInDays"))));
    config = {
      title: title.slice(0, 500),
      description: description?.slice(0, 2000) ?? null,
      dueInDays: dueInDays || null,
    };
  }

  const delayMinutes = Math.max(0, Math.round(n(formData.get("delayMinutes"))));

  const last = await prisma.workflowStep.findFirst({
    where: { workflowId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  await prisma.workflowStep.create({
    data: {
      workflowId,
      position,
      delayMinutes,
      actionType,
      config: JSON.stringify(config),
    },
  });
  // Bei zeitbasierten Triggern: Step-Hinzufügen erfordert Reschedule der zukünftigen
  // Shooting-Jobs, weil neue Jobs für diesen Step gebraucht werden.
  if (TIME_TRIGGER_SET.has(wf.trigger)) {
    await rescheduleForWorkflow(workflowId, userId);
  }
  revalidatePath(`/workflows/${workflowId}`);
}

export async function deleteWorkflowStep(stepId: string): Promise<void> {
  const userId = await requireUserId();
  const step = await prisma.workflowStep.findFirst({
    where: { id: stepId, workflow: { ownerId: userId } },
    select: { id: true, workflowId: true, workflow: { select: { trigger: true } } },
  });
  if (!step) throw new Error("Step nicht gefunden");
  await prisma.workflowStep.delete({ where: { id: stepId } });
  if (TIME_TRIGGER_SET.has(step.workflow.trigger)) {
    await rescheduleForWorkflow(step.workflowId, userId);
  }
  revalidatePath(`/workflows/${step.workflowId}`);
}

/**
 * Manueller Workflow-Start aus Shooting- oder Kunden-Detail.
 * Erlaubt nur Workflows mit Trigger "manual" (Schutz vor versehentlichem
 * Doppel-Trigger anderer Workflows). IDOR via ownerId-Match.
 */
export async function triggerManualWorkflow(
  workflowId: string,
  ctx: { customerId?: string | null; shootingId?: string | null },
): Promise<void> {
  const userId = await requireUserId();
  const wf = await prisma.workflow.findFirst({
    where: { id: workflowId, ownerId: userId, trigger: "manual", isActive: true },
    select: { id: true },
  });
  if (!wf) throw new Error("Manueller Workflow nicht gefunden oder inaktiv.");

  // Kontext-Validierung (IDOR): wenn IDs übergeben, müssen sie zum User gehören.
  if (ctx.customerId) {
    const c = await prisma.customer.findFirst({
      where: { id: ctx.customerId, ownerId: userId },
      select: { id: true },
    });
    if (!c) throw new Error("Kunde nicht gefunden.");
  }
  if (ctx.shootingId) {
    const sh = await prisma.shooting.findFirst({
      where: { id: ctx.shootingId, ownerId: userId },
      select: { id: true, customerId: true },
    });
    if (!sh) throw new Error("Shooting nicht gefunden.");
    // customerId aus Shooting ableiten falls fehlt
    if (!ctx.customerId) ctx.customerId = sh.customerId;
  }

  const { startManualWorkflow } = await import("@/lib/workflow/engine");
  await startManualWorkflow(workflowId, {
    ownerId: userId,
    customerId: ctx.customerId ?? null,
    shootingId: ctx.shootingId ?? null,
  });

  if (ctx.shootingId) revalidatePath(`/shootings/${ctx.shootingId}`);
  if (ctx.customerId) revalidatePath(`/kunden/${ctx.customerId}`);
}
