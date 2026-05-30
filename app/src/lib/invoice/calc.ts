// Pure-Funktionen für Rechnungs-Berechnung. Cent-Arithmetik, keine Float-Drift.

export type ItemInput = {
  quantity: number;
  unitPriceCents: number;
};

export function itemTotalCents(item: ItemInput): number {
  // quantity kann float sein (z.B. 1.5 h) — wir runden auf ganze Cent
  return Math.round(item.quantity * item.unitPriceCents);
}

export function computeTotals(items: ItemInput[], vatRate: number, isSmallBusiness: boolean) {
  const subtotalCents = items.reduce((acc, it) => acc + itemTotalCents(it), 0);
  const vatAmountCents = isSmallBusiness
    ? 0
    : Math.round(subtotalCents * (vatRate / 100));
  const totalCents = subtotalCents + vatAmountCents;
  return { subtotalCents, vatAmountCents, totalCents };
}
