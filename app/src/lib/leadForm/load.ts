import { prisma } from "@/lib/prisma";
import type { PublicForm, PublicField } from "./render";

/**
 * Lädt ein LeadForm anhand ID. Wird vom Embed-Render genutzt.
 */
export async function loadFormById(formId: string): Promise<PublicForm | null> {
  const form = await prisma.leadForm.findUnique({
    where: { id: formId },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!form || !form.isActive) return null;
  return mapForm(form);
}

/**
 * Lädt ein LeadForm via Slug + Owner — wird von der /anfrage/[slug]-Route genutzt.
 * Falls kein passendes Formular existiert, gibt null zurück (Caller fällt dann
 * ggf. auf das alte hartkodierte Formular zurück).
 */
export async function loadFormBySlug(ownerId: string, slug: string): Promise<PublicForm | null> {
  const form = await prisma.leadForm.findFirst({
    where: { ownerId, slug, isActive: true },
    include: { fields: { orderBy: { position: "asc" } } },
  });
  if (!form) return null;
  return mapForm(form);
}

function mapForm(form: {
  id: string;
  slug: string;
  headline: string | null;
  intro: string | null;
  buttonText: string;
  successMessage: string | null;
  accentColor: string;
  fontStyle: string;
  background: string;
  fields: Array<{
    id: string;
    type: string;
    systemKey: string | null;
    label: string;
    helpText: string | null;
    placeholder: string | null;
    required: boolean;
    options: string | null;
  }>;
}): PublicForm {
  const fields: PublicField[] = form.fields.map((f) => ({
    id: f.id,
    type: f.type,
    systemKey: f.systemKey,
    label: f.label,
    helpText: f.helpText,
    placeholder: f.placeholder,
    required: f.required,
    options: f.options ? safeParseOptions(f.options) : null,
  }));
  return {
    id: form.id,
    slug: form.slug,
    headline: form.headline,
    intro: form.intro,
    buttonText: form.buttonText,
    successMessage: form.successMessage,
    accentColor: form.accentColor,
    fontStyle: form.fontStyle,
    background: form.background,
    fields,
  };
}

function safeParseOptions(json: string): string[] | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.map(String);
    return null;
  } catch {
    return null;
  }
}
