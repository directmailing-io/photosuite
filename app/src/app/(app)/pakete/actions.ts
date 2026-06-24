"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { saveUpload } from "@/lib/upload";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}
function num(v: FormDataEntryValue | null): number | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const n = Number(str.replace(",", "."));
  return isNaN(n) ? undefined : n;
}

export async function createPackage(formData: FormData) {
  const userId = await requireUserId();
  const name = s(formData.get("name"));
  const price = num(formData.get("price"));
  if (!name || price == null) throw new Error("Name und Preis sind Pflicht.");

  const file = formData.get("cover") as File | null;
  let coverUrl: string | undefined;
  if (file && file.size > 0) {
    const r = await saveUpload(file, "packages");
    coverUrl = r.url;
  }
  const teamIds = formData.getAll("teamIds").map(String).filter(Boolean);
  const questionnaireIds = formData.getAll("questionnaireIds").map(String).filter(Boolean);
  const addonIds = formData.getAll("availableAddonIds").map(String).filter(Boolean);
  const primaryContactId = s(formData.get("primaryContactId"));

  // Ownership-Checks für alle verlinkten Entities — nur eigene IDs durchlassen.
  const ownedTeam = teamIds.length
    ? await prisma.teamMember.findMany({ where: { id: { in: teamIds }, ownerId: userId }, select: { id: true } })
    : [];
  const safeTeamIds = ownedTeam.map((t) => t.id);

  const ownedQuestionnaires = questionnaireIds.length
    ? await prisma.questionnaireTemplate.findMany({
        where: { id: { in: questionnaireIds }, ownerId: userId },
        select: { id: true },
      })
    : [];
  const safeQuestionnaireIds = ownedQuestionnaires.map((q) => q.id);

  const ownedAddons = addonIds.length
    ? await prisma.addon.findMany({ where: { id: { in: addonIds }, ownerId: userId }, select: { id: true } })
    : [];
  const safeAddonIds = ownedAddons.map((a) => a.id);

  let safePrimaryContactId: string | undefined = undefined;
  if (primaryContactId) {
    const pc = await prisma.teamMember.findFirst({ where: { id: primaryContactId, ownerId: userId } });
    if (pc) safePrimaryContactId = pc.id;
  }

  await prisma.package.create({
    data: {
      ownerId: userId,
      name,
      description: s(formData.get("description")),
      coverUrl,
      price,
      depositAmount: num(formData.get("depositAmount")),
      paymentTerms: s(formData.get("paymentTerms")),
      durationMin: num(formData.get("durationMin")),
      bookingBufferBeforeMin: Math.max(0, num(formData.get("bookingBufferBeforeMin")) ?? 0),
      bookingBufferAfterMin: Math.max(0, num(formData.get("bookingBufferAfterMin")) ?? 15),
      isActive: formData.get("isActive") === "on",
      primaryContactId: safePrimaryContactId,
      defaultTeam: safeTeamIds.length ? { connect: safeTeamIds.map((id) => ({ id })) } : undefined,
      defaultQuestionnaires: safeQuestionnaireIds.length ? { connect: safeQuestionnaireIds.map((id) => ({ id })) } : undefined,
      addons: safeAddonIds.length ? { connect: safeAddonIds.map((id) => ({ id })) } : undefined,
    },
  });
  revalidatePath("/pakete");
  redirect("/pakete");
}

export async function updatePackage(id: string, formData: FormData) {
  const userId = await requireUserId();
  const existing = await prisma.package.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Paket nicht gefunden");

  const file = formData.get("cover") as File | null;
  let coverUrl: string | undefined;
  if (file && file.size > 0) {
    const r = await saveUpload(file, "packages");
    coverUrl = r.url;
  }
  const teamIds = formData.getAll("teamIds").map(String).filter(Boolean);
  const questionnaireIds = formData.getAll("questionnaireIds").map(String).filter(Boolean);
  const addonIds = formData.getAll("availableAddonIds").map(String).filter(Boolean);
  const primaryContactId = s(formData.get("primaryContactId"));

  // Ownership-Checks für alle verlinkten Entities — nur eigene IDs durchlassen.
  const ownedTeam = teamIds.length
    ? await prisma.teamMember.findMany({ where: { id: { in: teamIds }, ownerId: userId }, select: { id: true } })
    : [];
  const safeTeamIds = ownedTeam.map((t) => t.id);

  const ownedQuestionnaires = questionnaireIds.length
    ? await prisma.questionnaireTemplate.findMany({
        where: { id: { in: questionnaireIds }, ownerId: userId },
        select: { id: true },
      })
    : [];
  const safeQuestionnaireIds = ownedQuestionnaires.map((q) => q.id);

  const ownedAddons = addonIds.length
    ? await prisma.addon.findMany({ where: { id: { in: addonIds }, ownerId: userId }, select: { id: true } })
    : [];
  const safeAddonIds = ownedAddons.map((a) => a.id);

  let safePrimaryContactId: string | null = null;
  if (primaryContactId) {
    const pc = await prisma.teamMember.findFirst({ where: { id: primaryContactId, ownerId: userId } });
    if (pc) safePrimaryContactId = pc.id;
  }

  await prisma.package.update({
    where: { id },
    data: {
      name: s(formData.get("name")) ?? existing.name,
      description: s(formData.get("description")) ?? null,
      coverUrl: coverUrl ?? existing.coverUrl,
      price: num(formData.get("price")) ?? existing.price,
      depositAmount: num(formData.get("depositAmount")) ?? null,
      paymentTerms: s(formData.get("paymentTerms")) ?? null,
      durationMin: num(formData.get("durationMin")) ?? null,
      bookingBufferBeforeMin: Math.max(0, num(formData.get("bookingBufferBeforeMin")) ?? existing.bookingBufferBeforeMin),
      bookingBufferAfterMin: Math.max(0, num(formData.get("bookingBufferAfterMin")) ?? existing.bookingBufferAfterMin),
      isActive: formData.get("isActive") === "on",
      primaryContactId: safePrimaryContactId,
      defaultTeam: { set: safeTeamIds.map((id) => ({ id })) },
      defaultQuestionnaires: { set: safeQuestionnaireIds.map((id) => ({ id })) },
      addons: { set: safeAddonIds.map((id) => ({ id })) },
    },
  });
  revalidatePath("/pakete");
  revalidatePath(`/pakete/${id}`);
}

export async function deletePackage(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.package.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Paket nicht gefunden");
  await prisma.package.delete({ where: { id } });
  revalidatePath("/pakete");
  redirect("/pakete");
}

// ---------- Checklisten-Vorlagen ----------

export async function addChecklistTemplate(packageId: string, formData: FormData) {
  const userId = await requireUserId();
  // Package-Ownership prüfen.
  const pkg = await prisma.package.findFirst({ where: { id: packageId, ownerId: userId } });
  if (!pkg) throw new Error("Paket nicht gefunden");
  const title = s(formData.get("title"));
  const audience = s(formData.get("audience")) === "CUSTOMER" ? "CUSTOMER" : "INTERNAL";
  if (!title) return;
  const max = await prisma.packageChecklistTemplate.findFirst({
    where: { packageId },
    orderBy: { position: "desc" },
  });
  await prisma.packageChecklistTemplate.create({
    data: { packageId, title, audience, position: (max?.position ?? -1) + 1 },
  });
  revalidatePath(`/pakete/${packageId}`);
}

export async function setTemplateAudience(id: string, audience: string, packageId: string) {
  const userId = await requireUserId();
  if (!["INTERNAL", "CUSTOMER"].includes(audience)) return;
  // Template via Package-Ownership absichern.
  const tpl = await prisma.packageChecklistTemplate.findFirst({
    where: { id, package: { ownerId: userId } },
  });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  await prisma.packageChecklistTemplate.update({ where: { id }, data: { audience } });
  revalidatePath(`/pakete/${packageId}`);
}

export async function deleteChecklistTemplate(id: string, packageId: string) {
  const userId = await requireUserId();
  const tpl = await prisma.packageChecklistTemplate.findFirst({
    where: { id, package: { ownerId: userId } },
  });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  await prisma.packageChecklistTemplate.delete({ where: { id } });
  revalidatePath(`/pakete/${packageId}`);
}

export async function renameChecklistTemplate(id: string, packageId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = s(formData.get("title"));
  if (!title) return;
  const tpl = await prisma.packageChecklistTemplate.findFirst({
    where: { id, package: { ownerId: userId } },
  });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  await prisma.packageChecklistTemplate.update({ where: { id }, data: { title } });
  revalidatePath(`/pakete/${packageId}`);
}

export async function addChecklistTemplateItem(templateId: string, packageId: string, formData: FormData) {
  const userId = await requireUserId();
  const label = s(formData.get("label"));
  if (!label) return;
  // Template via Package-Ownership absichern.
  const tpl = await prisma.packageChecklistTemplate.findFirst({
    where: { id: templateId, package: { ownerId: userId } },
  });
  if (!tpl) throw new Error("Vorlage nicht gefunden");
  const max = await prisma.packageChecklistItem.findFirst({
    where: { templateId },
    orderBy: { position: "desc" },
  });
  await prisma.packageChecklistItem.create({
    data: { templateId, label, position: (max?.position ?? -1) + 1 },
  });
  revalidatePath(`/pakete/${packageId}`);
}

export async function deleteChecklistTemplateItem(id: string, packageId: string) {
  const userId = await requireUserId();
  // Item via Template→Package-Ownership absichern.
  const item = await prisma.packageChecklistItem.findFirst({
    where: { id, template: { package: { ownerId: userId } } },
  });
  if (!item) throw new Error("Eintrag nicht gefunden");
  await prisma.packageChecklistItem.delete({ where: { id } });
  revalidatePath(`/pakete/${packageId}`);
}
