import { prisma } from "./prisma";

/**
 * Erzeugt atomar die nächste Rechnungsnummer für einen User.
 * Garantiert lückenlose, fortlaufende Nummern pro Jahr (Konvention §14 UStG).
 *
 * Format-Tokens im Template:
 *   {YYYY} → vollständiges Jahr (2026)
 *   {YY}   → kurzes Jahr (26)
 *   {MM}   → Monat (05)
 *   {####} → 4-stellige Nummer (0001)
 *   {###}  → 3-stellige Nummer (001)
 *   {##}   → 2-stellige Nummer (01)
 */
export async function nextInvoiceNumber(userId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { invoiceCounter: true, invoiceCounterYear: true, invoiceNumberFormat: true },
    });
    if (!user) throw new Error("User nicht gefunden");
    const sameYear = user.invoiceCounterYear === year;
    const nextCounter = sameYear ? user.invoiceCounter + 1 : 1;
    await tx.user.update({
      where: { id: userId },
      data: { invoiceCounter: nextCounter, invoiceCounterYear: year },
    });
    return { counter: nextCounter, format: user.invoiceNumberFormat };
  });

  return renderInvoiceNumber(updated.format, now, updated.counter);
}

export function renderInvoiceNumber(format: string, now: Date, counter: number): string {
  return format
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, "0"))
    .replace(/\{####\}/g, String(counter).padStart(4, "0"))
    .replace(/\{###\}/g, String(counter).padStart(3, "0"))
    .replace(/\{##\}/g, String(counter).padStart(2, "0"));
}
