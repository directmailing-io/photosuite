"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_TRIGGERS = new Set(["invoice_paid", "offer_accepted", "lead_created", "manual"]);
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

  await prisma.workflow.update({
    where: { id },
    data: {
      name: name.slice(0, 200),
      description: s(formData.get("description")),
      trigger,
    },
  });
  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

export async function toggleWorkflowActive(id: string, isActive: boolean): Promise<void> {
  const userId = await requireUserId();
  const wf = await prisma.workflow.findFirst({ where: { id, ownerId: userId } });
  if (!wf) throw new Error("Workflow nicht gefunden");
  await prisma.workflow.update({ where: { id }, data: { isActive } });
  revalidatePath("/workflows");
  revalidatePath(`/workflows/${id}`);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const userId = await requireUserId();
  const wf = await prisma.workflow.findFirst({ where: { id, ownerId: userId } });
  if (!wf) throw new Error("Workflow nicht gefunden");
  await prisma.workflow.delete({ where: { id } });
  revalidatePath("/workflows");
  redirect("/workflows");
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
  revalidatePath(`/workflows/${workflowId}`);
}

export async function deleteWorkflowStep(stepId: string): Promise<void> {
  const userId = await requireUserId();
  const step = await prisma.workflowStep.findFirst({
    where: { id: stepId, workflow: { ownerId: userId } },
    select: { id: true, workflowId: true },
  });
  if (!step) throw new Error("Step nicht gefunden");
  await prisma.workflowStep.delete({ where: { id: stepId } });
  revalidatePath(`/workflows/${step.workflowId}`);
}
