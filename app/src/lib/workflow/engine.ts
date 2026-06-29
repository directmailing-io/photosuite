/**
 * Workflow-Automations-Engine.
 *
 * - triggerWorkflow(): wird aus den Domain-Actions gerufen (markInvoicePaid,
 *   markOfferAccepted, leadCreate, …). Findet aktive Workflows mit passendem
 *   Trigger, erzeugt einen WorkflowRun + WorkflowJobs für jeden Step.
 * - processScheduledJobs(): wird vom Cron-Endpoint /api/cron/workflows
 *   periodisch aufgerufen (z.B. alle 5 Min). Pickt fällige Jobs und führt
 *   die Action aus. Idempotent durch Status-Update.
 *
 * Action-Typen:
 *   - "email": Versendet Mail an Kundin oder Lisa, mit Subject + Body, in dem
 *     Template-Variablen wie {customer.firstName} ersetzt werden.
 *   - "task": Legt eine Aufgabe für Lisa an, optional mit Fälligkeit.
 */

import { prisma } from "@/lib/prisma";
import { sendEmailAsUser } from "@/lib/email/send";

export type TriggerType = "invoice_paid" | "offer_accepted" | "lead_created" | "manual";

export type TriggerContext = {
  ownerId: string;
  customerId?: string | null;
  invoiceId?: string | null;
  offerId?: string | null;
  shootingId?: string | null;
  leadId?: string | null;
};

type EmailConfig = {
  to: "customer" | "owner";
  subject: string;
  body: string;
};

type TaskConfig = {
  title: string;
  description?: string;
  dueInDays?: number;
};

/**
 * Wird aus Domain-Actions gerufen. Erzeugt für jeden passenden aktiven
 * Workflow einen WorkflowRun + die Jobs.
 *
 * Fire-and-forget: Caller sollte NICHT awaiten oder den Fehler-Pfad fangen,
 * damit Trigger-Aufrufe die Domain-Operation nicht blockieren oder kippen.
 */
export async function triggerWorkflow(trigger: TriggerType, ctx: TriggerContext): Promise<void> {
  if (trigger === "manual") return; // Manuelle Trigger laufen über explizite UI-Action

  const workflows = await prisma.workflow.findMany({
    where: { ownerId: ctx.ownerId, trigger, isActive: true },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (workflows.length === 0) return;

  const now = new Date();
  for (const wf of workflows) {
    if (wf.steps.length === 0) continue;
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: wf.id,
        ownerId: ctx.ownerId,
        customerId: ctx.customerId ?? null,
        invoiceId: ctx.invoiceId ?? null,
        offerId: ctx.offerId ?? null,
        shootingId: ctx.shootingId ?? null,
        leadId: ctx.leadId ?? null,
        status: "pending",
      },
    });
    await prisma.workflowJob.createMany({
      data: wf.steps.map((step) => ({
        runId: run.id,
        stepPosition: step.position,
        actionType: step.actionType,
        configSnapshot: step.config,
        runAt: new Date(now.getTime() + step.delayMinutes * 60_000),
      })),
    });
  }
}

/**
 * Cron-Worker. Pickt bis zu `limit` fällige Jobs und führt sie aus.
 * Locked-via-update: Status auf "running" setzen, bevor wir die Action
 * starten — verhindert Doppelausführung bei überlappenden Cron-Triggern.
 */
export async function processScheduledJobs(limit = 50): Promise<{
  picked: number;
  done: number;
  failed: number;
}> {
  const now = new Date();
  const candidates = await prisma.workflowJob.findMany({
    where: { status: "pending", runAt: { lte: now } },
    take: limit,
    orderBy: { runAt: "asc" },
  });

  let done = 0;
  let failed = 0;
  for (const job of candidates) {
    // Atomic lock: nur weiterfahren, wenn unser updateMany ein Row geändert
    // hat (d.h. niemand anderes hat den Job in der Zwischenzeit gepickt).
    const locked = await prisma.workflowJob.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "running" },
    });
    if (locked.count === 0) continue;

    try {
      await executeJob(job);
      await prisma.workflowJob.update({
        where: { id: job.id },
        data: { status: "done", executedAt: new Date() },
      });
      done++;
    } catch (err: any) {
      await prisma.workflowJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          executedAt: new Date(),
          result: JSON.stringify({ error: err?.message ?? String(err) }),
        },
      });
      failed++;
    }
  }

  // Marker auf den Run setzen: wenn alle Jobs erledigt sind, Run als done.
  await markCompletedRuns();
  return { picked: candidates.length, done, failed };
}

async function markCompletedRuns(): Promise<void> {
  const pendingRuns = await prisma.workflowRun.findMany({
    where: { status: "pending" },
    include: { jobs: { select: { status: true } } },
  });
  for (const run of pendingRuns) {
    if (run.jobs.length === 0) continue;
    const allDone = run.jobs.every((j) => j.status === "done");
    const anyFailed = run.jobs.some((j) => j.status === "failed");
    const anyOpen = run.jobs.some((j) => j.status === "pending" || j.status === "running");
    if (anyOpen) continue;
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: anyFailed ? "failed" : "done" },
    });
  }
}

async function executeJob(job: { id: string; runId: string; actionType: string; configSnapshot: string }): Promise<void> {
  const run = await prisma.workflowRun.findUnique({ where: { id: job.runId } });
  if (!run) throw new Error("Run nicht gefunden");
  const config = JSON.parse(job.configSnapshot);
  const vars = await loadVariables(run);

  if (job.actionType === "email") {
    await executeEmail(run.ownerId, config as EmailConfig, vars);
  } else if (job.actionType === "task") {
    await executeTask(run.ownerId, config as TaskConfig, vars, run);
  } else {
    throw new Error(`Unbekannter actionType: ${job.actionType}`);
  }
}

type TemplateVars = {
  customer?: { firstName: string; lastName: string; email: string | null };
  invoice?: { number: string | null; total: string };
  offer?: { number: string | null; total: string };
  shooting?: { title: string };
  studio?: { name: string; fromEmail: string | null };
};

async function loadVariables(run: { customerId: string | null; invoiceId: string | null; offerId: string | null; shootingId: string | null; ownerId: string }): Promise<TemplateVars> {
  const [owner, customer, invoice, offer, shooting] = await Promise.all([
    prisma.user.findUnique({
      where: { id: run.ownerId },
      select: { studioName: true, smtpFromEmail: true, smtpFromName: true, name: true },
    }),
    run.customerId
      ? prisma.customer.findUnique({
          where: { id: run.customerId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null,
    run.invoiceId
      ? prisma.invoice.findUnique({
          where: { id: run.invoiceId },
          select: { number: true, totalCents: true },
        })
      : null,
    run.offerId
      ? prisma.offer.findUnique({
          where: { id: run.offerId },
          select: { number: true, totalCents: true },
        })
      : null,
    run.shootingId
      ? prisma.shooting.findUnique({
          where: { id: run.shootingId },
          select: { title: true },
        })
      : null,
  ]);

  function fmtCents(c: number): string {
    return (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  return {
    studio: {
      name: owner?.smtpFromName ?? owner?.studioName ?? owner?.name ?? "",
      fromEmail: owner?.smtpFromEmail ?? null,
    },
    customer: customer ?? undefined,
    invoice: invoice ? { number: invoice.number, total: fmtCents(invoice.totalCents) } : undefined,
    offer: offer ? { number: offer.number, total: fmtCents(offer.totalCents) } : undefined,
    shooting: shooting ?? undefined,
  };
}

const VAR_RE = /\{([a-z]+)\.([a-zA-Z]+)\}/g;

/**
 * Ersetzt {entity.field}-Platzhalter durch ihre Werte. Unbekannte oder
 * undefinierte Werte werden zu leerem String (statt zu crashen).
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(VAR_RE, (_match, entity, field) => {
    const obj = (vars as any)[entity];
    if (!obj || obj[field] == null) return "";
    return String(obj[field]);
  });
}

async function executeEmail(ownerId: string, config: EmailConfig, vars: TemplateVars): Promise<void> {
  let to: string | null = null;
  if (config.to === "customer") {
    to = vars.customer?.email ?? null;
  } else if (config.to === "owner") {
    to = vars.studio?.fromEmail ?? null;
  }
  if (!to) throw new Error(`Empfänger-Mail für "${config.to}" fehlt`);

  const subject = renderTemplate(config.subject, vars);
  const text = renderTemplate(config.body, vars);

  const result = await sendEmailAsUser(ownerId, { to, subject, text });
  if (!result.ok) throw new Error(`Mail-Versand: ${result.reason}`);
}

async function executeTask(
  ownerId: string,
  config: TaskConfig,
  vars: TemplateVars,
  run: { customerId: string | null; shootingId: string | null },
): Promise<void> {
  const title = renderTemplate(config.title, vars) || "Workflow-Aufgabe";
  const description = config.description ? renderTemplate(config.description, vars) : null;
  const dueAt = config.dueInDays && config.dueInDays > 0
    ? new Date(Date.now() + config.dueInDays * 86400_000)
    : null;

  await prisma.task.create({
    data: {
      title: title.slice(0, 500),
      description,
      dueAt,
      customerId: run.customerId,
      shootingId: run.shootingId,
      ownerId,
    },
  });
}
