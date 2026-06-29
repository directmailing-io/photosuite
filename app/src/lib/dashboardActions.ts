"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { validateWidgetSelection } from "./dashboardWidgets";

export async function setDashboardWidgets(keys: string[]): Promise<void> {
  const userId = await requireUserId();
  const validated = validateWidgetSelection(keys);
  await prisma.user.update({
    where: { id: userId },
    data: { dashboardWidgets: JSON.stringify(validated) },
  });
  revalidatePath("/");
}
