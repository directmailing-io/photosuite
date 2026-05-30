"use server";

import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/upload";
import { ALLOWED_MIME, MAX_FILE_BYTES } from "@/lib/questionnaire";
import { revalidatePath } from "next/cache";

async function loadShootingWithQuestionnaire(slug: string, qid: string) {
  const shooting = await prisma.shooting.findUnique({
    where: { publicSlug: slug },
    include: { questionnaires: { where: { id: qid }, include: { fields: true } } },
  });
  if (!shooting || shooting.questionnaires.length === 0) return null;
  return { shooting, questionnaire: shooting.questionnaires[0] };
}

export async function trackOpen(slug: string, qid: string) {
  const ctx = await loadShootingWithQuestionnaire(slug, qid);
  if (!ctx) return;
  const q = ctx.questionnaire;
  if (q.status === "SUBMITTED") return; // submitted bleibt submitted
  const update: { status?: string; openedAt?: Date } = {};
  if (!q.openedAt) update.openedAt = new Date();
  if (q.status === "SENT" || q.status === "DRAFT") update.status = "OPENED";
  if (Object.keys(update).length > 0) {
    await prisma.questionnaire.update({ where: { id: q.id }, data: update });
    revalidatePath(`/shootings/${ctx.shooting.id}`);
    revalidatePath(`/shootings/${ctx.shooting.id}/fragebogen/${qid}`);
  }
}

// Antwort-Wert in passendes Feld auf Prisma-Side mappen
type AnswerInput = {
  fieldId: string;
  type: string;
  value: any; // string | number | boolean | string[] | { url, filename, ... } | null
};

function toPrismaData(input: AnswerInput) {
  const base = {
    textValue: null as string | null,
    numberValue: null as number | null,
    dateValue: null as Date | null,
    boolValue: null as boolean | null,
    jsonValue: null as string | null,
  };
  if (input.value == null || input.value === "") return base;
  switch (input.type) {
    case "TEXT":
    case "TEXTAREA":
    case "EMAIL":
    case "PHONE":
      base.textValue = String(input.value);
      break;
    case "NUMBER":
      base.numberValue = typeof input.value === "number" ? input.value : Number(input.value);
      if (Number.isNaN(base.numberValue)) base.numberValue = null;
      break;
    case "DATE":
      base.dateValue = new Date(input.value);
      if (isNaN(base.dateValue.getTime())) base.dateValue = null;
      break;
    case "YES_NO":
      base.boolValue = Boolean(input.value);
      break;
    case "RATING":
      base.numberValue = Number(input.value);
      break;
    case "SELECT_SINGLE":
      base.textValue = String(input.value);
      break;
    case "SELECT_MULTI":
      base.jsonValue = JSON.stringify(Array.isArray(input.value) ? input.value : []);
      break;
    case "FILE":
      base.jsonValue = JSON.stringify(input.value);
      break;
  }
  return base;
}

export async function saveAnswers(
  slug: string,
  qid: string,
  answers: AnswerInput[],
  isSubmit: boolean,
) {
  const ctx = await loadShootingWithQuestionnaire(slug, qid);
  if (!ctx) throw new Error("Fragebogen nicht gefunden");
  if (ctx.questionnaire.status === "SUBMITTED") throw new Error("Bereits abgesendet");

  const fieldMap = new Map(ctx.questionnaire.fields.map((f) => [f.id, f]));

  if (isSubmit) {
    // Pflichtfelder prüfen
    for (const f of ctx.questionnaire.fields) {
      if (!f.required) continue;
      const ans = answers.find((a) => a.fieldId === f.id);
      const v = ans?.value;
      const empty =
        v == null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        throw new Error(`„${f.label}" ist Pflicht`);
      }
    }
  }

  // Antworten upserten
  await prisma.$transaction(async (tx) => {
    for (const a of answers) {
      const field = fieldMap.get(a.fieldId);
      if (!field) continue;
      const data = toPrismaData({ ...a, type: field.type });
      await tx.questionnaireAnswer.upsert({
        where: { questionnaireId_fieldId: { questionnaireId: qid, fieldId: a.fieldId } },
        create: { questionnaireId: qid, fieldId: a.fieldId, ...data },
        update: data,
      });
    }
    await tx.questionnaire.update({
      where: { id: qid },
      data: {
        lastSavedAt: new Date(),
        status: isSubmit ? "SUBMITTED" : (ctx.questionnaire.status === "OPENED" || ctx.questionnaire.status === "SENT" ? "IN_PROGRESS" : ctx.questionnaire.status),
        submittedAt: isSubmit ? new Date() : ctx.questionnaire.submittedAt,
      },
    });
  });

  revalidatePath(`/shootings/${ctx.shooting.id}`);
  revalidatePath(`/shootings/${ctx.shooting.id}/fragebogen/${qid}`);
  revalidatePath(`/k/${slug}/fragebogen/${qid}`);
}

// Server-Side Validation für Datei-Uploads
export async function uploadAnswerFile(
  slug: string,
  qid: string,
  fieldId: string,
  formData: FormData,
): Promise<{ url: string; filename: string; sizeBytes: number; mimeType: string }> {
  const ctx = await loadShootingWithQuestionnaire(slug, qid);
  if (!ctx) throw new Error("Fragebogen nicht gefunden");
  const field = ctx.questionnaire.fields.find((f) => f.id === fieldId);
  if (!field || field.type !== "FILE") throw new Error("Ungültiges Feld");
  if (ctx.questionnaire.status === "SUBMITTED") throw new Error("Bereits abgesendet");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Keine Datei ausgewählt");
  if (file.size > MAX_FILE_BYTES) throw new Error(`Datei zu groß (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`);
  if (!ALLOWED_MIME.has(file.type)) throw new Error(`Dateityp nicht erlaubt: ${file.type || "unbekannt"}`);

  // Magic-Byte Check für die wichtigsten Typen (defense-in-depth)
  const buf = Buffer.from(await file.arrayBuffer());
  const head = buf.slice(0, 12);
  const isJPEG = head[0] === 0xff && head[1] === 0xd8;
  const isPNG = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isWebP = head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP";
  const isPDF = head.toString("ascii", 0, 4) === "%PDF";
  const isHEIC = head.slice(4, 12).toString("ascii").includes("ftyp");
  if (!(isJPEG || isPNG || isWebP || isPDF || isHEIC)) {
    throw new Error("Dateiinhalt passt nicht zum Typ");
  }

  // Speichern
  const result = await saveUpload(file, `questionnaire/${qid}`);
  return result;
}
