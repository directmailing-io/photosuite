"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

const VALID_TYPES = new Set([
  "TEXT","TEXTAREA","NUMBER","EMAIL","PHONE","DATE",
  "SELECT_SINGLE","SELECT_MULTI","YES_NO","RATING","FILE",
]);

export async function createQuestionnaire(shootingId: string, formData: FormData) {
  const title = s(formData.get("title")) ?? "Neuer Fragebogen";
  const max = await prisma.questionnaire.findFirst({
    where: { shootingId },
    orderBy: { position: "desc" },
  });
  const q = await prisma.questionnaire.create({
    data: { shootingId, title, position: (max?.position ?? -1) + 1 },
  });
  revalidatePath(`/shootings/${shootingId}`);
  redirect(`/shootings/${shootingId}/fragebogen/${q.id}`);
}

export async function createQuestionnaireFromTemplate(shootingId: string, templateId: string) {
  const tpl = await prisma.questionnaireTemplate.findUnique({
    where: { id: templateId },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  const max = await prisma.questionnaire.findFirst({
    where: { shootingId },
    orderBy: { position: "desc" },
  });
  const q = await prisma.questionnaire.create({
    data: {
      shootingId,
      title: tpl.title,
      description: tpl.description,
      position: (max?.position ?? -1) + 1,
      fields: {
        create: tpl.fields.map((f) => ({
          type: f.type,
          label: f.label,
          helpText: f.helpText,
          required: f.required,
          options: f.options,
          position: f.position,
        })),
      },
    },
  });
  revalidatePath(`/shootings/${shootingId}`);
  redirect(`/shootings/${shootingId}/fragebogen/${q.id}`);
}

export async function updateQuestionnaireMeta(id: string, formData: FormData) {
  const q = await prisma.questionnaire.findUnique({ where: { id } });
  if (!q) throw new Error("Fragebogen nicht gefunden");
  await prisma.questionnaire.update({
    where: { id },
    data: {
      title: s(formData.get("title")) ?? q.title,
      description: s(formData.get("description")) ?? null,
    },
  });
  revalidatePath(`/shootings/${q.shootingId}/fragebogen/${id}`);
  revalidatePath(`/shootings/${q.shootingId}`);
}

export async function deleteQuestionnaire(id: string) {
  const q = await prisma.questionnaire.findUnique({ where: { id } });
  if (!q) return;
  await prisma.questionnaire.delete({ where: { id } });
  revalidatePath(`/shootings/${q.shootingId}`);
  redirect(`/shootings/${q.shootingId}`);
}

export async function sendQuestionnaire(id: string) {
  const q = await prisma.questionnaire.findUnique({ where: { id }, include: { fields: true } });
  if (!q) throw new Error("Fragebogen nicht gefunden");
  if (q.fields.length === 0) throw new Error("Lege mindestens ein Feld an, bevor du den Bogen versendest.");
  await prisma.questionnaire.update({
    where: { id },
    data: { status: "SENT", sentAt: q.sentAt ?? new Date() },
  });
  revalidatePath(`/shootings/${q.shootingId}/fragebogen/${id}`);
  revalidatePath(`/shootings/${q.shootingId}`);
}

export async function reopenQuestionnaire(id: string) {
  const q = await prisma.questionnaire.findUnique({ where: { id } });
  if (!q) return;
  await prisma.questionnaire.update({ where: { id }, data: { status: "DRAFT" } });
  revalidatePath(`/shootings/${q.shootingId}/fragebogen/${id}`);
}

// ---------- Felder ----------

export async function addField(questionnaireId: string, formData: FormData) {
  const type = s(formData.get("type"));
  const label = s(formData.get("label"));
  if (!type || !VALID_TYPES.has(type)) throw new Error("Ungültiger Feld-Typ");
  if (!label) throw new Error("Frage ist Pflicht");
  const max = await prisma.questionnaireField.findFirst({
    where: { questionnaireId },
    orderBy: { position: "desc" },
  });
  const optionsRaw = s(formData.get("options"));
  let optionsJson: string | undefined;
  if (optionsRaw && (type === "SELECT_SINGLE" || type === "SELECT_MULTI")) {
    const arr = optionsRaw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    optionsJson = JSON.stringify(arr);
  }
  await prisma.questionnaireField.create({
    data: {
      questionnaireId,
      type,
      label,
      helpText: s(formData.get("helpText")),
      required: formData.get("required") === "on",
      options: optionsJson,
      position: (max?.position ?? -1) + 1,
    },
  });
  const q = await prisma.questionnaire.findUnique({ where: { id: questionnaireId } });
  if (q) revalidatePath(`/shootings/${q.shootingId}/fragebogen/${questionnaireId}`);
}

export async function updateField(id: string, formData: FormData) {
  const f = await prisma.questionnaireField.findUnique({ where: { id } });
  if (!f) return;
  const type = s(formData.get("type")) ?? f.type;
  const optionsRaw = s(formData.get("options"));
  let optionsJson: string | null = f.options;
  if (type === "SELECT_SINGLE" || type === "SELECT_MULTI") {
    if (optionsRaw) {
      const arr = optionsRaw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      optionsJson = JSON.stringify(arr);
    }
  } else {
    optionsJson = null;
  }
  await prisma.questionnaireField.update({
    where: { id },
    data: {
      type,
      label: s(formData.get("label")) ?? f.label,
      helpText: s(formData.get("helpText")) ?? null,
      required: formData.get("required") === "on",
      options: optionsJson,
    },
  });
  const q = await prisma.questionnaire.findUnique({ where: { id: f.questionnaireId } });
  if (q) revalidatePath(`/shootings/${q.shootingId}/fragebogen/${f.questionnaireId}`);
}

export async function deleteField(id: string) {
  const f = await prisma.questionnaireField.findUnique({ where: { id } });
  if (!f) return;
  await prisma.questionnaireField.delete({ where: { id } });
  const q = await prisma.questionnaire.findUnique({ where: { id: f.questionnaireId } });
  if (q) revalidatePath(`/shootings/${q.shootingId}/fragebogen/${f.questionnaireId}`);
}

export async function moveField(id: string, direction: "up" | "down") {
  const f = await prisma.questionnaireField.findUnique({ where: { id } });
  if (!f) return;
  const siblings = await prisma.questionnaireField.findMany({
    where: { questionnaireId: f.questionnaireId },
    orderBy: { position: "asc" },
  });
  const idx = siblings.findIndex((x) => x.id === id);
  const swapWith = direction === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return;
  await prisma.$transaction([
    prisma.questionnaireField.update({ where: { id: f.id }, data: { position: swapWith.position } }),
    prisma.questionnaireField.update({ where: { id: swapWith.id }, data: { position: f.position } }),
  ]);
  const q = await prisma.questionnaire.findUnique({ where: { id: f.questionnaireId } });
  if (q) revalidatePath(`/shootings/${q.shootingId}/fragebogen/${f.questionnaireId}`);
}
