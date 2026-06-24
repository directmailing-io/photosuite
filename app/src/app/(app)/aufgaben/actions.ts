"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}
function dt(v: FormDataEntryValue | null): Date | null | undefined {
  const str = s(v);
  if (str == null) return undefined;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export async function createTask(formData: FormData) {
  const userId = await requireUserId();
  const title = s(formData.get("title"));
  if (!title) throw new Error("Titel ist Pflicht");

  // Cross-Reference-Checks: customerId/shootingId müssen — wenn gesetzt — dem User gehören
  const customerId = s(formData.get("customerId"));
  if (customerId) {
    const ok = await prisma.customer.findFirst({ where: { id: customerId, ownerId: userId } });
    if (!ok) throw new Error("Kunde nicht gefunden");
  }
  const shootingId = s(formData.get("shootingId"));
  if (shootingId) {
    const ok = await prisma.shooting.findFirst({ where: { id: shootingId, ownerId: userId } });
    if (!ok) throw new Error("Shooting nicht gefunden");
  }

  await prisma.task.create({
    data: {
      title,
      description: s(formData.get("description")),
      dueAt: dt(formData.get("dueAt")) ?? null,
      customerId,
      shootingId,
      ownerId: userId,
    },
  });
  revalidatePath("/aufgaben");
  revalidatePath("/");
}

export async function toggleTask(id: string, done: boolean) {
  const userId = await requireUserId();
  const task = await prisma.task.findFirst({ where: { id, ownerId: userId } });
  if (!task) throw new Error("Aufgabe nicht gefunden");
  await prisma.task.update({ where: { id }, data: { done } });
  revalidatePath("/aufgaben");
  revalidatePath("/");
}

export async function deleteTask(id: string) {
  const userId = await requireUserId();
  const task = await prisma.task.findFirst({ where: { id, ownerId: userId } });
  if (!task) throw new Error("Aufgabe nicht gefunden");
  await prisma.task.delete({ where: { id } });
  revalidatePath("/aufgaben");
  revalidatePath("/");
}
