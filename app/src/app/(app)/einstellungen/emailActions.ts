"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { testSmtpConnection, sendEmailAsUser } from "@/lib/email/send";
import { revalidatePath } from "next/cache";

function s(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function num(v: FormDataEntryValue | null): number | null {
  const str = s(v);
  if (!str) return null;
  const n = Number(str);
  return isNaN(n) ? null : n;
}

/**
 * Speichert SMTP-Konfiguration. Wenn ein neues Passwort übergeben wird, wird es
 * verschlüsselt (AES-256-GCM via lib/crypto.ts). Leeres Passwort = bestehendes
 * Passwort beibehalten (Lisa soll bei Edit nicht jedes Mal neu tippen müssen).
 */
export async function saveSmtpConfig(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const newPw = s(formData.get("smtpPassword"));
  const host = s(formData.get("smtpHost"));
  const port = num(formData.get("smtpPort"));
  const secure = formData.get("smtpSecure") === "on";
  const user = s(formData.get("smtpUser"));
  const fromEmail = s(formData.get("smtpFromEmail"));
  const fromName = s(formData.get("smtpFromName"));
  const emailNotifyDefault = formData.get("emailNotifyDefault") === "on";
  const payConfirmCustomer = formData.get("payConfirmCustomer") === "on";
  const payConfirmOwner = formData.get("payConfirmOwner") === "on";

  // Wenn Felder leer sind UND kein bestehendes Setup vorhanden, einfach leeren.
  // Wenn Felder gefüllt → speichern.
  const data: any = {
    smtpHost: host,
    smtpPort: port,
    smtpSecure: secure,
    smtpUser: user,
    smtpFromEmail: fromEmail,
    smtpFromName: fromName,
    emailNotifyDefault,
    payConfirmCustomer,
    payConfirmOwner,
  };
  if (newPw) {
    data.smtpPasswordEnc = encryptSecret(newPw, userId);
  }
  // Wenn alles leer war (Reset), Passwort-Feld auch leeren.
  if (!host && !user && !fromEmail && !newPw) {
    data.smtpPasswordEnc = null;
  }

  await prisma.user.update({ where: { id: userId }, data });
  revalidatePath("/einstellungen");
}

/**
 * SMTP-Verbindung testen — versucht Login zum Server ohne Mail zu senden.
 * Nutzt entweder neue Form-Daten oder gespeichertes Passwort.
 */
export async function testSmtpFromConfig(formData: FormData): Promise<{ ok: boolean; reason?: string }> {
  const userId = await requireUserId();
  const host = s(formData.get("smtpHost"));
  const port = num(formData.get("smtpPort"));
  const secure = formData.get("smtpSecure") === "on";
  const smtpUser = s(formData.get("smtpUser"));
  const newPw = s(formData.get("smtpPassword"));

  if (!host || !port || !smtpUser) {
    return { ok: false, reason: "Bitte Host, Port und Benutzer ausfüllen." };
  }

  let pw = newPw;
  if (!pw) {
    // Fallback auf gespeichertes Passwort
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { smtpPasswordEnc: true },
    });
    if (!existing?.smtpPasswordEnc) {
      return { ok: false, reason: "Bitte Passwort eingeben." };
    }
    try {
      pw = decryptSecret(existing.smtpPasswordEnc, userId);
    } catch {
      return { ok: false, reason: "Gespeichertes Passwort konnte nicht entschlüsselt werden." };
    }
  }

  const res = await testSmtpConnection({ host, port, secure, user: smtpUser, pass: pw });
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

/**
 * Sendet eine Test-Mail an die eingeloggte Person (an `smtpFromEmail`).
 * Nutzt das tatsächlich gespeicherte Setup — best-Test bevor Lisa
 * an Kundinnen sendet.
 */
export async function sendTestEmail(): Promise<{ ok: boolean; reason?: string }> {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { smtpFromEmail: true, smtpFromName: true, studioName: true },
  });
  if (!user?.smtpFromEmail) {
    return { ok: false, reason: "Bitte zuerst SMTP-Konfiguration speichern." };
  }
  const studio = user.smtpFromName ?? user.studioName ?? "Lisa CRM";
  const res = await sendEmailAsUser(userId, {
    to: user.smtpFromEmail,
    subject: `Test-Mail aus ${studio}`,
    text: `Hi! Wenn du das hier liest, funktioniert dein SMTP-Setup einwandfrei.\n\nDu kannst jetzt Kundinnen aus dem CRM heraus benachrichtigen.`,
    html: `
      <div style="font-family:Georgia,serif;max-width:520px;padding:24px;">
        <h1 style="margin:0 0 12px;">Test-Mail erfolgreich ✓</h1>
        <p>Wenn du das hier liest, funktioniert dein SMTP-Setup einwandfrei.</p>
        <p>Du kannst jetzt Kundinnen aus dem CRM heraus benachrichtigen.</p>
      </div>
    `,
  });
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}
