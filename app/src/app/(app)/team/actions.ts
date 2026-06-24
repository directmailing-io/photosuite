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

export async function createTeamMember(formData: FormData) {
  const userId = await requireUserId();
  const firstName = s(formData.get("firstName"));
  const lastName = s(formData.get("lastName"));
  if (!firstName || !lastName) throw new Error("Vor- und Nachname sind Pflicht.");

  const file = formData.get("avatar") as File | null;
  let avatarUrl: string | undefined;
  if (file && file.size > 0) {
    const r = await saveUpload(file, "team");
    avatarUrl = r.url;
  }
  const expertiseIds = formData.getAll("expertiseIds").map(String).filter(Boolean);
  // Expertise-Ownership prüfen — nur eigene Tags durchlassen.
  const ownedExpertise = expertiseIds.length
    ? await prisma.teamExpertise.findMany({
        where: { id: { in: expertiseIds }, ownerId: userId },
        select: { id: true },
      })
    : [];
  const safeExpertiseIds = ownedExpertise.map((e) => e.id);

  const member = await prisma.teamMember.create({
    data: {
      ownerId: userId,
      firstName,
      lastName,
      role: s(formData.get("role")),
      email: s(formData.get("email")),
      phone: s(formData.get("phone")),
      avatarUrl,
      bio: s(formData.get("bio")),
      instagram: s(formData.get("instagram")),
      facebook: s(formData.get("facebook")),
      tiktok: s(formData.get("tiktok")),
      website: s(formData.get("website")),
      expertise: safeExpertiseIds.length ? { connect: safeExpertiseIds.map((id) => ({ id })) } : undefined,
    },
  });
  revalidatePath("/team");
  redirect(`/team/${member.id}`);
}

export async function updateTeamMember(id: string, formData: FormData) {
  const userId = await requireUserId();
  // TeamMember-Tenant-Filter: NUR ownerId, nicht userId (userId = Self-Link auf Owner-Member).
  const existing = await prisma.teamMember.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Mitglied nicht gefunden");

  const file = formData.get("avatar") as File | null;
  let avatarUrl: string | undefined;
  if (file && file.size > 0) {
    const r = await saveUpload(file, "team");
    avatarUrl = r.url;
  }
  const expertiseIds = formData.getAll("expertiseIds").map(String).filter(Boolean);
  // Expertise-Ownership prüfen.
  const ownedExpertise = expertiseIds.length
    ? await prisma.teamExpertise.findMany({
        where: { id: { in: expertiseIds }, ownerId: userId },
        select: { id: true },
      })
    : [];
  const safeExpertiseIds = ownedExpertise.map((e) => e.id);

  await prisma.teamMember.update({
    where: { id },
    data: {
      firstName: s(formData.get("firstName")) ?? existing.firstName,
      lastName: s(formData.get("lastName")) ?? existing.lastName,
      role: s(formData.get("role")) ?? null,
      email: s(formData.get("email")) ?? null,
      phone: s(formData.get("phone")) ?? null,
      avatarUrl: avatarUrl ?? existing.avatarUrl,
      bio: s(formData.get("bio")) ?? null,
      instagram: s(formData.get("instagram")) ?? null,
      facebook: s(formData.get("facebook")) ?? null,
      tiktok: s(formData.get("tiktok")) ?? null,
      website: s(formData.get("website")) ?? null,
      expertise: { set: safeExpertiseIds.map((id) => ({ id })) },
    },
  });
  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
}

export async function deleteTeamMember(id: string) {
  const userId = await requireUserId();
  const m = await prisma.teamMember.findFirst({ where: { id, ownerId: userId } });
  if (!m) throw new Error("Mitglied nicht gefunden");
  if (m.isOwner) throw new Error("Eigenes Profil kann nicht gelöscht werden.");
  await prisma.teamMember.delete({ where: { id } });
  revalidatePath("/team");
  redirect("/team");
}

// Expertise-Tags
export async function createExpertise(formData: FormData) {
  const userId = await requireUserId();
  const label = s(formData.get("label"));
  const color = s(formData.get("color")) ?? "#9F877F";
  if (!label) return;
  await prisma.teamExpertise.create({ data: { ownerId: userId, label, color } });
  revalidatePath("/team");
  revalidatePath("/einstellungen");
}

export async function deleteExpertise(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.teamExpertise.findFirst({ where: { id, ownerId: userId } });
  if (!existing) throw new Error("Expertise nicht gefunden");
  await prisma.teamExpertise.delete({ where: { id } });
  revalidatePath("/team");
  revalidatePath("/einstellungen");
}
