// Snapshot der Aussteller-Daten zum Zeitpunkt des Ausstellens.
// IMMUTABLE — wird als JSON-String an der Rechnung gespeichert.
//
// Hintergrund (GoBD/§14 UStG): Eine ausgestellte Rechnung darf inhaltlich nicht
// mehr verändert werden. Wenn der User später z.B. seine Adresse ändert,
// dürfen alte Rechnungen die alte Adresse behalten — sonst wären sie nachträglich
// manipuliert.

export type IssuerSnapshot = {
  companyName: string;
  owner: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  taxId: string | null;
  vatId: string | null;
  isSmallBusiness: boolean;
  bankName: string | null;
  accountName: string | null;  // Kontoinhaber:in (optional, falls abweichend)
  iban: string | null;
  bic: string | null;
  email: string | null;
  phone: string | null;
  footerNote: string | null;
  // Logo (eingefroren beim Ausstellen — Re-Crop ändert alte Rechnungen NICHT)
  logoUrl: string | null;
  logoMimeType: string | null;  // SVG hat keine direkte PDF-Unterstützung → Fallback Text-Header
};

export function emptyIssuer(): IssuerSnapshot {
  return {
    companyName: "",
    owner: null,
    street: null,
    zip: null,
    city: null,
    country: "Deutschland",
    taxId: null,
    vatId: null,
    isSmallBusiness: true,
    bankName: null,
    accountName: null,
    iban: null,
    bic: null,
    email: null,
    phone: null,
    footerNote: null,
    logoUrl: null,
    logoMimeType: null,
  };
}

export function parseIssuer(json: string): IssuerSnapshot {
  try {
    const parsed = JSON.parse(json);
    return { ...emptyIssuer(), ...parsed };
  } catch {
    return emptyIssuer();
  }
}

export function issuerIsComplete(s: IssuerSnapshot): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!s.companyName) missing.push("Firmenname");
  if (!s.street) missing.push("Straße");
  if (!s.zip) missing.push("PLZ");
  if (!s.city) missing.push("Stadt");
  if (!s.taxId && !s.vatId) missing.push("Steuernummer oder USt-IdNr");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
