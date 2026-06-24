"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

function s(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

/**
 * Self-Service Sign-Up: legt einen neuen User-Account an mit komplett leerer Tenant-Welt.
 * Keine Default-Statuses, keine Default-Tags — Lisa möchte das Onboarding-Wizard-Flow.
 * Erfolg: Redirect auf /login mit Hinweis.
 */
export async function signUp(formData: FormData): Promise<{ ok: false; reason: string } | void> {
  const email = s(formData.get("email"))?.toLowerCase();
  const password = s(formData.get("password"));
  const studioName = s(formData.get("studioName")) ?? "Mein Studio";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "Bitte eine gültige E-Mail-Adresse angeben." };
  }
  if (!password || password.length < 8) {
    return { ok: false, reason: "Passwort muss mindestens 8 Zeichen lang sein." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, reason: "Diese E-Mail ist bereits registriert. Melde dich oben an." };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: studioName,
      studioName,
      // onboardingDismissed bleibt default false → Wizard zeigt sich beim ersten Login
    },
  });

  // Erfolgs-Redirect: Login-Page mit Banner „Account erstellt, bitte anmelden"
  redirect(`/login?signedUp=1&email=${encodeURIComponent(email)}`);
}
