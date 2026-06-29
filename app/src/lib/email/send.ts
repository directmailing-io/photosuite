import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

/**
 * Email-Versand via User-eigenen SMTP-Account.
 *
 * EU-Stack-Strategie:
 *   Statt einen US-Provider zu hardcoden, lädt jeder User seine eigenen
 *   SMTP-Zugangsdaten in den Settings. Damit bleibt die App provider-agnostisch.
 *   Empfohlene EU-Provider: Mailbox.org, IONOS, Hostinger, Posteo.
 *
 * Sicherheit:
 *   - Passwort liegt AES-256-GCM verschlüsselt in der DB (lib/crypto.ts).
 *   - Decryption nur im Server-Pfad, niemals zum Client.
 *   - Keine Server-side Persistierung des Plain-Passworts in Logs.
 */

export type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;        // Plain-Text-Fallback
  html?: string;       // optional, falls vorhanden Multipart
  replyTo?: string;
};

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

export async function sendEmailAsUser(userId: string, args: SendEmailArgs): Promise<SendResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPasswordEnc: true,
      smtpFromEmail: true,
      smtpFromName: true,
    },
  });

  if (!user) return { ok: false, reason: "User nicht gefunden" };
  if (!user.smtpHost || !user.smtpPort || !user.smtpUser || !user.smtpPasswordEnc || !user.smtpFromEmail) {
    return { ok: false, reason: "SMTP nicht konfiguriert" };
  }

  let pw: string;
  try {
    pw = decryptSecret(user.smtpPasswordEnc, userId);
  } catch {
    return { ok: false, reason: "SMTP-Passwort konnte nicht entschlüsselt werden" };
  }

  const transporter = nodemailer.createTransport({
    host: user.smtpHost,
    port: user.smtpPort,
    secure: user.smtpSecure,
    auth: { user: user.smtpUser, pass: pw },
  });

  const fromName = user.smtpFromName ? `"${user.smtpFromName.replace(/"/g, "")}" ` : "";

  try {
    const info = await transporter.sendMail({
      from: `${fromName}<${user.smtpFromEmail}>`,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      replyTo: args.replyTo,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "Unbekannter Versand-Fehler" };
  }
}

/**
 * Verbindungs-Test: Login zum SMTP-Server ohne Mail zu senden.
 * Liefert ok:true bei erfolgreichem Auth-Handshake.
 */
export async function testSmtpConnection(args: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}): Promise<SendResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: args.host,
      port: args.port,
      secure: args.secure,
      auth: { user: args.user, pass: args.pass },
    });
    await transporter.verify();
    return { ok: true, messageId: "verify-only" };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? "SMTP-Verbindung fehlgeschlagen" };
  }
}
