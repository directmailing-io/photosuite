"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet");
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("Kein User-Profil");
  return user.id;
}

function sanitizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  // Soft check: muss http(s) sein, sonst ablehnen — vermeidet versehentlich gespeicherte Text-Strings.
  if (!/^https?:\/\//i.test(t)) {
    throw new Error("Bitte einen vollständigen Link inkl. https:// angeben.");
  }
  return t;
}

export async function saveVideoLinks(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const zoom = sanitizeUrl(String(formData.get("zoom") ?? "").trim() || null);
  const meet = sanitizeUrl(String(formData.get("google_meet") ?? "").trim() || null);
  const teams = sanitizeUrl(String(formData.get("teams") ?? "").trim() || null);
  const whereby = sanitizeUrl(String(formData.get("whereby") ?? "").trim() || null);
  await prisma.user.update({
    where: { id: userId },
    data: {
      zoomPersonalLink: zoom,
      googleMeetPersonalLink: meet,
      teamsPersonalLink: teams,
      wherebyPersonalLink: whereby,
    },
  });
  revalidatePath("/einstellungen");
  revalidatePath("/buchungen");
}
