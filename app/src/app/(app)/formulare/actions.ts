"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_TYPES = new Set(["text", "textarea", "email", "phone", "select", "date", "consent"]);
const VALID_SYSTEM_KEYS = new Set(["firstName", "lastName", "email", "phone", "message"]);
const VALID_FONT_STYLES = new Set(["sans", "serif"]);
const VALID_BACKGROUNDS = new Set(["paper", "linen", "transparent"]);

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[äöüß]/g, (ch) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[ch as "ä"|"ö"|"ü"|"ß"]!))
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function validateHex(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#C8102E";
}

/**
 * Erstellt ein neues Formular mit Standard-Feldern (Name, Email, Telefon, Nachricht).
 * Lisa kann diese später anpassen.
 */
export async function createLeadForm(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const name = s(formData.get("name"));
  if (!name) throw new Error("Name darf nicht leer sein.");
  let slug = slugify(s(formData.get("slug")) ?? name);
  if (slug.length < 3) throw new Error("Slug zu kurz (min. 3 Zeichen, a-z, 0-9, -).");

  // Slug-Conflict-Check
  const existing = await prisma.leadForm.findFirst({ where: { ownerId: userId, slug } });
  if (existing) {
    // Slug eindeutig machen durch -2, -3, …
    let suffix = 2;
    while (true) {
      const candidate = `${slug}-${suffix}`.slice(0, 40);
      const taken = await prisma.leadForm.findFirst({ where: { ownerId: userId, slug: candidate } });
      if (!taken) { slug = candidate; break; }
      suffix++;
      if (suffix > 50) throw new Error("Konnte keinen freien Slug finden.");
    }
  }

  const form = await prisma.leadForm.create({
    data: {
      ownerId: userId,
      name: name.slice(0, 200),
      slug,
      headline: name.slice(0, 200),
      intro: "Schreib uns eine kurze Anfrage — wir melden uns innerhalb von 2 Werktagen.",
      successMessage: "Danke! Wir haben deine Anfrage erhalten und melden uns bald.",
      fields: {
        create: [
          { type: "text", systemKey: "firstName", label: "Vorname", required: true, position: 0 },
          { type: "text", systemKey: "lastName", label: "Nachname", required: false, position: 1 },
          { type: "email", systemKey: "email", label: "E-Mail", required: true, position: 2 },
          { type: "phone", systemKey: "phone", label: "Telefon", required: false, position: 3 },
          { type: "textarea", systemKey: "message", label: "Deine Nachricht", required: false, position: 4 },
          { type: "consent", label: "Ich stimme der Verarbeitung meiner Daten zur Bearbeitung der Anfrage zu.", required: true, position: 5 },
        ],
      },
    },
  });

  revalidatePath("/formulare");
  redirect(`/formulare/${form.id}`);
}

export async function updateLeadFormMeta(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const form = await prisma.leadForm.findFirst({ where: { id, ownerId: userId } });
  if (!form) throw new Error("Formular nicht gefunden");

  const name = s(formData.get("name"));
  if (!name) throw new Error("Name darf nicht leer sein.");
  const slugRaw = s(formData.get("slug"));
  const slug = slugRaw ? slugify(slugRaw) : form.slug;
  if (slug.length < 3) throw new Error("Slug zu kurz.");
  if (slug !== form.slug) {
    const taken = await prisma.leadForm.findFirst({ where: { ownerId: userId, slug, NOT: { id } } });
    if (taken) throw new Error("Dieser Slug ist bereits vergeben.");
  }

  await prisma.leadForm.update({
    where: { id },
    data: {
      name: name.slice(0, 200),
      slug,
      headline: s(formData.get("headline")),
      intro: s(formData.get("intro")),
      buttonText: s(formData.get("buttonText")) ?? "Anfrage senden",
      successMessage: s(formData.get("successMessage")),
    },
  });
  revalidatePath(`/formulare/${id}`);
  revalidatePath("/formulare");
}

export async function updateLeadFormDesign(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const form = await prisma.leadForm.findFirst({ where: { id, ownerId: userId } });
  if (!form) throw new Error("Formular nicht gefunden");

  const accentColor = validateHex(s(formData.get("accentColor")) ?? "#C8102E");
  const fontStyleRaw = s(formData.get("fontStyle")) ?? "sans";
  const fontStyle = VALID_FONT_STYLES.has(fontStyleRaw) ? fontStyleRaw : "sans";
  const backgroundRaw = s(formData.get("background")) ?? "paper";
  const background = VALID_BACKGROUNDS.has(backgroundRaw) ? backgroundRaw : "paper";

  await prisma.leadForm.update({
    where: { id },
    data: { accentColor, fontStyle, background },
  });
  revalidatePath(`/formulare/${id}`);
}

export async function toggleLeadFormActive(id: string, isActive: boolean): Promise<void> {
  const userId = await requireUserId();
  const form = await prisma.leadForm.findFirst({ where: { id, ownerId: userId } });
  if (!form) throw new Error("Formular nicht gefunden");
  await prisma.leadForm.update({ where: { id }, data: { isActive } });
  revalidatePath("/formulare");
  revalidatePath(`/formulare/${id}`);
}

export async function deleteLeadForm(id: string): Promise<void> {
  const userId = await requireUserId();
  const form = await prisma.leadForm.findFirst({ where: { id, ownerId: userId } });
  if (!form) throw new Error("Formular nicht gefunden");
  // Lead.leadFormId wird via ON DELETE SET NULL aufgelöst — Leads bleiben erhalten.
  await prisma.leadForm.delete({ where: { id } });
  revalidatePath("/formulare");
}

export async function addLeadFormField(formId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const form = await prisma.leadForm.findFirst({ where: { id: formId, ownerId: userId } });
  if (!form) throw new Error("Formular nicht gefunden");

  const type = s(formData.get("type")) ?? "text";
  if (!VALID_TYPES.has(type)) throw new Error("Ungültiger Feld-Typ.");
  const label = s(formData.get("label"));
  if (!label) throw new Error("Label darf nicht leer sein.");
  const systemKeyRaw = s(formData.get("systemKey"));
  const systemKey = systemKeyRaw && VALID_SYSTEM_KEYS.has(systemKeyRaw) ? systemKeyRaw : null;

  // Verhindern, dass derselbe systemKey doppelt vergeben wird.
  if (systemKey) {
    const conflict = await prisma.leadFormField.findFirst({
      where: { formId, systemKey },
    });
    if (conflict) throw new Error(`Es gibt schon ein Feld mit dem System-Key „${systemKey}".`);
  }

  // Optionen für select-Typ: kommagetrennt
  let optionsJson: string | null = null;
  if (type === "select") {
    const raw = s(formData.get("options"));
    if (raw) {
      const parts = raw.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
      if (parts.length > 0) optionsJson = JSON.stringify(parts);
    }
  }

  const last = await prisma.leadFormField.findFirst({
    where: { formId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  await prisma.leadFormField.create({
    data: {
      formId,
      type,
      systemKey,
      label: label.slice(0, 200),
      helpText: s(formData.get("helpText"))?.slice(0, 500) ?? null,
      placeholder: s(formData.get("placeholder"))?.slice(0, 200) ?? null,
      required: formData.get("required") === "on",
      options: optionsJson,
      position,
    },
  });
  revalidatePath(`/formulare/${formId}`);
}

export async function updateLeadFormField(fieldId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const field = await prisma.leadFormField.findFirst({
    where: { id: fieldId, form: { ownerId: userId } },
    include: { form: { select: { id: true } } },
  });
  if (!field) throw new Error("Feld nicht gefunden");

  const label = s(formData.get("label"));
  if (!label) throw new Error("Label darf nicht leer sein.");

  let optionsJson: string | null = field.options;
  if (field.type === "select") {
    const raw = s(formData.get("options"));
    if (raw) {
      const parts = raw.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
      optionsJson = parts.length > 0 ? JSON.stringify(parts) : null;
    }
  }

  await prisma.leadFormField.update({
    where: { id: fieldId },
    data: {
      label: label.slice(0, 200),
      helpText: s(formData.get("helpText"))?.slice(0, 500) ?? null,
      placeholder: s(formData.get("placeholder"))?.slice(0, 200) ?? null,
      required: formData.get("required") === "on",
      options: optionsJson,
    },
  });
  revalidatePath(`/formulare/${field.form.id}`);
}

export async function deleteLeadFormField(fieldId: string): Promise<void> {
  const userId = await requireUserId();
  const field = await prisma.leadFormField.findFirst({
    where: { id: fieldId, form: { ownerId: userId } },
    include: { form: { select: { id: true } } },
  });
  if (!field) throw new Error("Feld nicht gefunden");
  await prisma.leadFormField.delete({ where: { id: fieldId } });
  revalidatePath(`/formulare/${field.form.id}`);
}

/**
 * Verschiebt ein Feld in der Reihenfolge. delta = -1 (hoch) oder +1 (runter).
 */
export async function moveLeadFormField(fieldId: string, delta: -1 | 1): Promise<void> {
  const userId = await requireUserId();
  const field = await prisma.leadFormField.findFirst({
    where: { id: fieldId, form: { ownerId: userId } },
    include: { form: { select: { id: true } } },
  });
  if (!field) throw new Error("Feld nicht gefunden");

  const neighbor = await prisma.leadFormField.findFirst({
    where: {
      formId: field.formId,
      position: delta === -1 ? { lt: field.position } : { gt: field.position },
    },
    orderBy: { position: delta === -1 ? "desc" : "asc" },
  });
  if (!neighbor) return; // schon am Rand

  await prisma.$transaction([
    prisma.leadFormField.update({ where: { id: field.id }, data: { position: neighbor.position } }),
    prisma.leadFormField.update({ where: { id: neighbor.id }, data: { position: field.position } }),
  ]);
  revalidatePath(`/formulare/${field.form.id}`);
}
