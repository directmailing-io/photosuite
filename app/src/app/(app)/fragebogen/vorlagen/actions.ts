"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
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

export async function createTemplate(formData: FormData) {
  const userId = await requireUserId();
  const title = s(formData.get("title")) ?? "Neue Vorlage";
  const max = await prisma.questionnaireTemplate.findFirst({
    where: { ownerId: userId },
    orderBy: { position: "desc" },
  });
  const tpl = await prisma.questionnaireTemplate.create({
    data: {
      title,
      description: s(formData.get("description")),
      position: (max?.position ?? -1) + 1,
      ownerId: userId,
    },
  });
  revalidatePath("/fragebogen/vorlagen");
  redirect(`/fragebogen/vorlagen/${tpl.id}`);
}

export async function updateTemplateMeta(id: string, formData: FormData) {
  const userId = await requireUserId();
  const tpl = await prisma.questionnaireTemplate.findFirst({ where: { id, ownerId: userId } });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  await prisma.questionnaireTemplate.update({
    where: { id },
    data: {
      title: s(formData.get("title")) ?? "Vorlage",
      description: s(formData.get("description")) ?? null,
    },
  });
  revalidatePath(`/fragebogen/vorlagen/${id}`);
  revalidatePath("/fragebogen/vorlagen");
}

export async function deleteTemplate(id: string) {
  const userId = await requireUserId();
  const tpl = await prisma.questionnaireTemplate.findFirst({ where: { id, ownerId: userId } });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  await prisma.questionnaireTemplate.delete({ where: { id } });
  revalidatePath("/fragebogen/vorlagen");
  redirect("/fragebogen/vorlagen");
}

// ---------- Felder ----------

export async function addTemplateField(templateId: string, formData: FormData) {
  const userId = await requireUserId();
  const tpl = await prisma.questionnaireTemplate.findFirst({ where: { id: templateId, ownerId: userId } });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  const type = s(formData.get("type"));
  const label = s(formData.get("label"));
  if (!type || !VALID_TYPES.has(type)) throw new Error("Ungültiger Feld-Typ");
  if (!label) throw new Error("Frage ist Pflicht");
  const max = await prisma.questionnaireTemplateField.findFirst({
    where: { templateId },
    orderBy: { position: "desc" },
  });
  const optionsRaw = s(formData.get("options"));
  let optionsJson: string | undefined;
  if (optionsRaw && (type === "SELECT_SINGLE" || type === "SELECT_MULTI")) {
    const arr = optionsRaw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    optionsJson = JSON.stringify(arr);
  }
  await prisma.questionnaireTemplateField.create({
    data: {
      templateId,
      type,
      label,
      helpText: s(formData.get("helpText")),
      required: formData.get("required") === "on",
      options: optionsJson,
      position: (max?.position ?? -1) + 1,
    },
  });
  revalidatePath(`/fragebogen/vorlagen/${templateId}`);
}

export async function updateTemplateField(id: string, formData: FormData) {
  const userId = await requireUserId();
  // Field hat selbst kein ownerId — über template joinen
  const f = await prisma.questionnaireTemplateField.findFirst({
    where: { id, template: { ownerId: userId } },
  });
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
  await prisma.questionnaireTemplateField.update({
    where: { id },
    data: {
      type,
      label: s(formData.get("label")) ?? f.label,
      helpText: s(formData.get("helpText")) ?? null,
      required: formData.get("required") === "on",
      options: optionsJson,
    },
  });
  revalidatePath(`/fragebogen/vorlagen/${f.templateId}`);
}

export async function deleteTemplateField(id: string) {
  const userId = await requireUserId();
  const f = await prisma.questionnaireTemplateField.findFirst({
    where: { id, template: { ownerId: userId } },
  });
  if (!f) return;
  await prisma.questionnaireTemplateField.delete({ where: { id } });
  revalidatePath(`/fragebogen/vorlagen/${f.templateId}`);
}

export async function moveTemplateField(id: string, direction: "up" | "down") {
  const userId = await requireUserId();
  const f = await prisma.questionnaireTemplateField.findFirst({
    where: { id, template: { ownerId: userId } },
  });
  if (!f) return;
  const siblings = await prisma.questionnaireTemplateField.findMany({
    where: { templateId: f.templateId },
    orderBy: { position: "asc" },
  });
  const idx = siblings.findIndex((x) => x.id === id);
  const swapWith = direction === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return;
  await prisma.$transaction([
    prisma.questionnaireTemplateField.update({ where: { id: f.id }, data: { position: swapWith.position } }),
    prisma.questionnaireTemplateField.update({ where: { id: swapWith.id }, data: { position: f.position } }),
  ]);
  revalidatePath(`/fragebogen/vorlagen/${f.templateId}`);
}
