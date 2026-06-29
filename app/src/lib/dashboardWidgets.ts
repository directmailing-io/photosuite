/**
 * Dashboard-Widget-System.
 * Whitelist + Default-Set + Safe-Parse zentral, damit
 *  - Server-Action gegen Injection schützt
 *  - Server-Component gegen DB-Korruption robust ist
 *  - Picker dieselbe Quelle für UI nutzt
 */

export type WidgetKey =
  | "revenue_year"
  | "revenue_quarter"
  | "revenue_month"
  | "revenue_planned_month"
  | "shootings_month"
  | "payments_open"
  | "submissions_new";

export type WidgetDef = {
  key: WidgetKey;
  label: string;       // Card-Label (eyebrow)
  sub: string;         // Card-Untertitel
  description: string; // Picker-Beschreibung
  group: "Einnahmen" | "Auslastung" | "Workflow";
};

export const WIDGET_DEFS: ReadonlyArray<WidgetDef> = [
  {
    key: "revenue_year",
    label: "Einnahmen Jahr",
    sub: "Bezahlt YTD",
    description: "Summe aller bezahlten Rechnungen seit Jahresbeginn.",
    group: "Einnahmen",
  },
  {
    key: "revenue_quarter",
    label: "Einnahmen Quartal",
    sub: "Bezahlt im Quartal",
    description: "Bezahlte Rechnungen im laufenden Quartal.",
    group: "Einnahmen",
  },
  {
    key: "revenue_month",
    label: "Einnahmen Monat",
    sub: "Bezahlt diesen Monat",
    description: "Bezahlte Rechnungen im laufenden Monat.",
    group: "Einnahmen",
  },
  {
    key: "revenue_planned_month",
    label: "Monatsumsatz",
    sub: "Geplant / bereits eingenommen",
    description: "Geplanter Umsatz aus Shootings diesen Monat — Klein-Text zeigt, wie viel davon schon bezahlt ist.",
    group: "Einnahmen",
  },
  {
    key: "shootings_month",
    label: "Diesen Monat",
    sub: "Anstehende Shootings",
    description: "Anzahl Shootings im laufenden Monat, die noch nicht abgeschlossen sind.",
    group: "Auslastung",
  },
  {
    key: "payments_open",
    label: "Offene Zahlungen",
    sub: "Davon überfällig",
    description: "Offene Rechnungen mit noch nicht beglichenem Betrag. Überfällige werden separat ausgewiesen.",
    group: "Workflow",
  },
  {
    key: "submissions_new",
    label: "Neue Einreichungen",
    sub: "Fragebögen",
    description: "Frisch eingereichte Fragebögen, die du noch nicht angesehen hast.",
    group: "Workflow",
  },
];

export const WIDGET_KEYS: ReadonlySet<WidgetKey> = new Set(WIDGET_DEFS.map((w) => w.key));

export const MAX_WIDGETS = 4;
export const MIN_WIDGETS = 1;

export const DEFAULT_WIDGETS: ReadonlyArray<WidgetKey> = [
  "revenue_month",
  "shootings_month",
  "payments_open",
  "submissions_new",
];

/**
 * Liest den persistierten JSON-String robust:
 * - null/empty → Defaults
 * - korrupt → Defaults (kein Throw)
 * - mit unbekannten Keys → gefiltert
 * - oberhalb MAX_WIDGETS → trunkiert
 */
export function parseDashboardWidgets(raw: string | null | undefined): WidgetKey[] {
  if (!raw) return [...DEFAULT_WIDGETS];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_WIDGETS];
    const filtered = parsed
      .filter((k): k is string => typeof k === "string")
      .filter((k): k is WidgetKey => WIDGET_KEYS.has(k as WidgetKey));
    // Deduplizieren + truncate
    const unique = Array.from(new Set(filtered)).slice(0, MAX_WIDGETS);
    if (unique.length === 0) return [...DEFAULT_WIDGETS];
    return unique;
  } catch {
    return [...DEFAULT_WIDGETS];
  }
}

/**
 * Validiert Client-Input: nur Whitelist-Keys, deduped, min/max-Grenzen.
 * Wirft bei Verstoß — Server-Action soll fehlschlagen.
 */
export function validateWidgetSelection(input: unknown): WidgetKey[] {
  if (!Array.isArray(input)) throw new Error("Ungültiges Format");
  const keys = input.filter((k): k is string => typeof k === "string");
  const valid = keys.filter((k): k is WidgetKey => WIDGET_KEYS.has(k as WidgetKey));
  const unique = Array.from(new Set(valid));
  if (unique.length < MIN_WIDGETS) throw new Error(`Mindestens ${MIN_WIDGETS} Widget auswählen.`);
  if (unique.length > MAX_WIDGETS) throw new Error(`Maximal ${MAX_WIDGETS} Widgets gleichzeitig.`);
  return unique;
}
