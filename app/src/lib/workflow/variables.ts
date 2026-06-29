/**
 * Variablen-Definition + Template-Rendering — client-safe (kein Prisma-Import).
 *
 * Single Source of Truth für die Liste verfügbarer Platzhalter, die im
 * Workflow-Editor sowohl im Variablen-Picker (Click-to-Insert) als auch
 * in der Live-Vorschau benutzt werden.
 */

export type VariableGroup = {
  label: string;
  vars: Array<{ token: string; description: string; sample: string }>;
};

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: "Kundin",
    vars: [
      { token: "{customer.firstName}",      description: "Vorname",            sample: "Sophia" },
      { token: "{customer.lastName}",       description: "Nachname",           sample: "Becker" },
      { token: "{customer.fullName}",       description: "Vor- und Nachname",  sample: "Sophia Becker" },
      { token: "{customer.email}",          description: "E-Mail",             sample: "sophia@example.com" },
      { token: "{customer.phone}",          description: "Telefon",            sample: "+49 170 1234567" },
      { token: "{customer.birthday}",       description: "Geburtsdatum",       sample: "15. März 1992" },
      { token: "{customer.billingStreet}",  description: "Rechnungs-Straße",   sample: "Hauptstr. 12" },
      { token: "{customer.billingZip}",     description: "Rechnungs-PLZ",      sample: "10115" },
      { token: "{customer.billingCity}",    description: "Rechnungs-Stadt",    sample: "Berlin" },
      { token: "{customer.billingCountry}", description: "Rechnungs-Land",     sample: "Deutschland" },
    ],
  },
  {
    label: "Rechnung",
    vars: [
      { token: "{invoice.number}",  description: "Rechnungsnummer",  sample: "2026-0042" },
      { token: "{invoice.total}",   description: "Gesamtbetrag (€)", sample: "1.250,00 €" },
      { token: "{invoice.dueDate}", description: "Fälligkeitsdatum", sample: "15. Juli 2026" },
    ],
  },
  {
    label: "Angebot",
    vars: [
      { token: "{offer.number}",     description: "Angebotsnummer",   sample: "A-2026-0007" },
      { token: "{offer.total}",      description: "Gesamtbetrag (€)", sample: "1.250,00 €" },
      { token: "{offer.validUntil}", description: "Gültig bis",       sample: "10. Juli 2026" },
    ],
  },
  {
    label: "Shooting",
    vars: [
      { token: "{shooting.title}",       description: "Shooting-Titel",     sample: "Boudoir-Shooting Sophia" },
      { token: "{shooting.scheduledAt}", description: "Shooting-Termin",    sample: "20. Juli 2026" },
      { token: "{shooting.location}",    description: "Shooting-Ort",       sample: "Studio Hauptstraße" },
    ],
  },
  {
    label: "Studio",
    vars: [
      { token: "{studio.name}",    description: "Studio-Name",    sample: "Lisa Steiner Photography" },
      { token: "{studio.phone}",   description: "Studio-Telefon", sample: "+49 30 1234567" },
      { token: "{studio.website}", description: "Studio-Website", sample: "https://lisa-steiner.de" },
    ],
  },
];

const VAR_RE = /\{([a-z]+)\.([a-zA-Z]+)\}/g;

/**
 * Pure Template-Replace-Funktion. Identische Logik wie in der Engine,
 * aber ohne Prisma-Abhängigkeit — kann client-seitig in der Vorschau genutzt werden.
 */
export function renderTemplate(template: string, vars: Record<string, Record<string, string | null | undefined>>): string {
  return template.replace(VAR_RE, (_match, entity, field) => {
    const obj = vars[entity];
    if (!obj || obj[field] == null) return "";
    return String(obj[field]);
  });
}

/**
 * Beispiel-Variablen-Objekt aus VARIABLE_GROUPS — für die Live-Vorschau.
 */
export function getSampleVars(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const group of VARIABLE_GROUPS) {
    for (const v of group.vars) {
      const m = v.token.match(/\{([a-z]+)\.([a-zA-Z]+)\}/);
      if (!m) continue;
      const [, entity, field] = m;
      if (!out[entity]) out[entity] = {};
      out[entity][field] = v.sample;
    }
  }
  return out;
}
