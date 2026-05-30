"use server";

import { prisma } from "@/lib/prisma";
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
  const title = s(formData.get("title"));
  if (!title) throw new Error("Titel ist Pflicht");
  await prisma.task.create({
    data: {
      title,
      description: s(formData.get("description")),
      dueAt: dt(formData.get("dueAt")) ?? null,
      customerId: s(formData.get("customerId")),
      shootingId: s(formData.get("shootingId")),
    },
  });
  revalidatePath("/aufgaben");
  revalidatePath("/");
}

export async function toggleTask(id: string, done: boolean) {
  await prisma.task.update({ where: { id }, data: { done } });
  revalidatePath("/aufgaben");
  revalidatePath("/");
}

export async function deleteTask(id: string) {
  await prisma.task.delete({ where: { id } });
  revalidatePath("/aufgaben");
  revalidatePath("/");
}
