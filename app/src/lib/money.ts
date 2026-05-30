// Geld-Helfer — alles in Cent gespeichert, hier konvertieren.

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function eurFromCents(cents: number): string {
  return EUR.format(cents / 100);
}

export function centsFromInput(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const str = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(str);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function eurInputFromCents(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
