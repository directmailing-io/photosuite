import { prisma } from "@/lib/prisma";
import { sendEmailAsUser } from "./send";

/**
 * High-Level-Helper für Customer-Notifications.
 * Lädt Customer + Shooting, prüft Opt-in, baut Email mit Link zur Kundenansicht
 * und versendet via User-SMTP.
 *
 * Best-Effort: bei jedem Fehler (kein Opt-in, kein SMTP, kein Email-Empfänger,
 * SMTP-Fehler) wird der Aufruf silent skipped — niemals soll die eigentliche
 * Action (z.B. Termin anlegen) wegen Email-Versand fehlschlagen.
 *
 * Whitespace-only HTML-Escape (kein User-HTML-Input, also reicht das).
 */

export type NotifyEventKind =
  | "new_date"
  | "updated_date"
  | "deleted_date"
  | "location_updated"
  | "new_checklist"
  | "new_invoice"
  | "general_update";

const SUBJECT: Record<NotifyEventKind, string> = {
  new_date: "Neuer Termin",
  updated_date: "Termin aktualisiert",
  deleted_date: "Termin entfernt",
  location_updated: "Location aktualisiert",
  new_checklist: "Neue Checkliste",
  new_invoice: "Neue Rechnung",
  general_update: "Update zu deinem Shooting",
};

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function notifyCustomerOfUpdate(args: {
  shootingId: string;
  kind: NotifyEventKind;
  detail?: string; // Frei-Text, z.B. „Fitting am 15.03." — wird in den Body interpoliert
}): Promise<void> {
  try {
    const shooting = await prisma.shooting.findUnique({
      where: { id: args.shootingId },
      include: {
        customer: { select: { id: true, firstName: true, email: true, emailOptIn: true } },
        owner: { select: { id: true, studioName: true, name: true } },
      },
    });
    if (!shooting) return;
    const { customer, owner } = shooting;
    if (!customer.email) return;
    if (!customer.emailOptIn) return;

    const baseUrl = process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? "";
    const link = shooting.publicSlug ? `${baseUrl}/k/${shooting.publicSlug}` : null;
    const studioName = owner.studioName ?? owner.name;

    const subject = `${SUBJECT[args.kind]} — ${shooting.title}`;
    const safeFirst = htmlEscape(customer.firstName);
    const safeDetail = args.detail ? htmlEscape(args.detail) : null;
    const safeStudio = htmlEscape(studioName);

    const text = [
      `Hi ${customer.firstName},`,
      "",
      `es gibt eine Aktualisierung zu deinem Shooting bei ${studioName}:`,
      args.detail ? `→ ${args.detail}` : `→ ${SUBJECT[args.kind]}`,
      "",
      link ? `Schau gern in dein Dashboard: ${link}` : "",
      "",
      "Bis bald,",
      studioName,
    ].filter(Boolean).join("\n");

    const html = `
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#19191A;">
        <p style="font-size:18px;margin:0 0 12px;">Hi <em>${safeFirst}</em>,</p>
        <p style="margin:0 0 16px;line-height:1.5;">
          es gibt eine Aktualisierung zu deinem Shooting bei <strong>${safeStudio}</strong>:
        </p>
        <div style="background:#FBE9EC;border-left:3px solid #C8102E;padding:14px 18px;margin:16px 0;">
          <strong style="font-size:15px;">${SUBJECT[args.kind]}</strong>
          ${safeDetail ? `<p style="margin:6px 0 0;color:#19191A;">${safeDetail}</p>` : ""}
        </div>
        ${link ? `
          <p style="margin:24px 0 0;">
            <a href="${link}" style="display:inline-block;background:#19191A;color:#FFF;padding:10px 18px;text-decoration:none;border-radius:6px;font-family:sans-serif;font-size:14px;">
              Dein Dashboard öffnen →
            </a>
          </p>
        ` : ""}
        <p style="color:#7D7878;font-size:12px;margin-top:32px;line-height:1.5;">
          Diese Mail wurde automatisch verschickt, weil sich etwas an deinem Shooting geändert hat.
          Wenn du keine weiteren Mails möchtest, schreib uns einfach kurz.
        </p>
      </div>
    `.trim();

    await sendEmailAsUser(owner.id, {
      to: customer.email,
      subject,
      text,
      html,
    });
  } catch {
    // Silent — Notify ist Best-Effort
  }
}
