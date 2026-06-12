"use server";

import { prisma } from "@/lib/prisma";
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

  await prisma.package.create({
    data: {
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
      primaryContactId: s(formData.get("primaryContactId")),
      defaultTeam: teamIds.length ? { connect: teamIds.map((id) => ({ id })) } : undefined,
      defaultQuestionnaires: questionnaireIds.length ? { connect: questionnaireIds.map((id) => ({ id })) } : undefined,
      addons: addonIds.length ? { connect: addonIds.map((id) => ({ id })) } : undefined,
    },
  });
  revalidatePath("/pakete");
  redirect("/pakete");
}

export async function updatePackage(id: string, formData: FormData) {
  const existing = await prisma.package.findUnique({ where: { id } });
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
      primaryContactId: s(formData.get("primaryContactId")) ?? null,
      defaultTeam: { set: teamIds.map((id) => ({ id })) },
      defaultQuestionnaires: { set: questionnaireIds.map((id) => ({ id })) },
      addons: { set: addonIds.map((id) => ({ id })) },
    },
  });
  revalidatePath("/pakete");
  revalidatePath(`/pakete/${id}`);
}

export async function deletePackage(id: string) {
  await prisma.package.delete({ where: { id } });
  revalidatePath("/pakete");
  redirect("/pakete");
}

// ---------- Checklisten-Vorlagen ----------

export async function addChecklistTemplate(packageId: string, formData: FormData) {
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
  if (!["INTERNAL", "CUSTOMER"].includes(audience)) return;
  await prisma.packageChecklistTemplate.update({ where: { id }, data: { audience } });
  revalidatePath(`/pakete/${packageId}`);
}

export async function deleteChecklistTemplate(id: string, packageId: string) {
  await prisma.packageChecklistTemplate.delete({ where: { id } });
  revalidatePath(`/pakete/${packageId}`);
}

export async function renameChecklistTemplate(id: string, packageId: string, formData: FormData) {
  const title = s(formData.get("title"));
  if (!title) return;
  await prisma.packageChecklistTemplate.update({ where: { id }, data: { title } });
  revalidatePath(`/pakete/${packageId}`);
}

export async function addChecklistTemplateItem(templateId: string, packageId: string, formData: FormData) {
  const label = s(formData.get("label"));
  if (!label) return;
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
  await prisma.packageChecklistItem.delete({ where: { id } });
  revalidatePath(`/pakete/${packageId}`);
}
