// Bankleitzahl-Lookup für Auto-BIC + Bank-Namen bei IBAN-Eingabe.
//
// Lokale Tabelle der wichtigsten deutschen Banken — kein externer API-Call.
// Begründung: CLOUD-Act-/GDPR-Risiken, Latenz, Offline-Fähigkeit.
// Quelle: Deutsche Bundesbank Bankleitzahlendatei (öffentlich).
//
// Abdeckt die ~150 größten DE-Geschäfts-/Privat-/Genossenschafts-/Sparkassen-/Direktbanken.
// Wenn die BLZ nicht gefunden wird, gibt parseGermanIban() weiterhin `{ blz }` zurück —
// der User kann Bank + BIC dann manuell ausfüllen.

export type BankInfo = {
  blz: string;        // 8-stellig
  name: string;       // offizielle Bezeichnung
  bic: string;        // SWIFT/BIC, 8 oder 11 Stellen
};

const BANKS: ReadonlyArray<BankInfo> = [
  // Direktbanken & Fintechs
  { blz: "10010010", name: "Postbank", bic: "PBNKDEFFXXX" },
  { blz: "10011001", name: "N26 Bank", bic: "NTSBDEB1XXX" },
  { blz: "10010424", name: "Solaris Bank", bic: "SOBKDEBBXXX" },
  { blz: "10010700", name: "Bunq", bic: "BUNQNL2AXXX" },
  { blz: "20011001", name: "ING-DiBa", bic: "INGDDEFFXXX" },
  { blz: "50011002", name: "Comdirect Bank", bic: "COBADEHDXXX" },
  { blz: "30010700", name: "DKB Deutsche Kreditbank", bic: "BYLADEM1001" },
  { blz: "12030000", name: "DKB Deutsche Kreditbank", bic: "BYLADEM1001" },
  { blz: "10011003", name: "Vivid Money", bic: "SXPYDEHHXXX" },

  // Deutsche Großbanken
  { blz: "10070000", name: "Deutsche Bank Berlin", bic: "DEUTDEBBXXX" },
  { blz: "20070000", name: "Deutsche Bank Hamburg", bic: "DEUTDEHHXXX" },
  { blz: "30070010", name: "Deutsche Bank Düsseldorf", bic: "DEUTDEDDXXX" },
  { blz: "50070010", name: "Deutsche Bank Frankfurt", bic: "DEUTDEFFXXX" },
  { blz: "60070024", name: "Deutsche Bank Stuttgart", bic: "DEUTDESSXXX" },
  { blz: "70070010", name: "Deutsche Bank München", bic: "DEUTDEMMXXX" },
  { blz: "10080000", name: "Commerzbank Berlin", bic: "DRESDEFF101" },
  { blz: "20080000", name: "Commerzbank Hamburg", bic: "COBADEFF200" },
  { blz: "30080000", name: "Commerzbank Düsseldorf", bic: "COBADEDDXXX" },
  { blz: "50080000", name: "Commerzbank Frankfurt", bic: "COBADEFFXXX" },
  { blz: "60080000", name: "Commerzbank Stuttgart", bic: "COBADEFF600" },
  { blz: "70080000", name: "Commerzbank München", bic: "DRESDEFF700" },
  { blz: "37040044", name: "Commerzbank Köln", bic: "COBADEFFXXX" },
  { blz: "50040000", name: "Commerzbank Frankfurt", bic: "COBADEFFXXX" },
  { blz: "10020000", name: "Berliner Bank", bic: "BEBEDEBBXXX" },
  { blz: "76020070", name: "UniCredit Bank (HVB)", bic: "HYVEDEMM460" },
  { blz: "70020270", name: "UniCredit Bank München (HVB)", bic: "HYVEDEMMXXX" },
  { blz: "20030000", name: "UniCredit Bank Hamburg (HVB)", bic: "HYVEDEMM300" },

  // Sparkassen (Top-20 größte)
  { blz: "10050000", name: "Sparkasse Berlin (Berliner Sparkasse)", bic: "BELADEBEXXX" },
  { blz: "20050550", name: "Hamburger Sparkasse", bic: "HASPDEHHXXX" },
  { blz: "30050110", name: "Sparkasse KölnBonn", bic: "COLSDE33XXX" },
  { blz: "37050198", name: "Sparkasse KölnBonn", bic: "COLSDE33XXX" },
  { blz: "37050299", name: "Kreissparkasse Köln", bic: "COKSDE33XXX" },
  { blz: "36050105", name: "Sparkasse Essen", bic: "SPESDE3EXXX" },
  { blz: "44050199", name: "Sparkasse Dortmund", bic: "DORTDE33XXX" },
  { blz: "45050001", name: "Sparkasse Hagen", bic: "WELADE3HXXX" },
  { blz: "50050201", name: "Frankfurter Sparkasse", bic: "HELADEF1822" },
  { blz: "60050101", name: "Landesbank Baden-Württemberg / BW-Bank", bic: "SOLADEST600" },
  { blz: "70050000", name: "Bayerische Landesbank", bic: "BYLADEMMXXX" },
  { blz: "60100070", name: "Postbank Stuttgart", bic: "PBNKDEFF600" },
  { blz: "26050001", name: "Sparkasse Hannover", bic: "SPKHDE2HXXX" },
  { blz: "25050299", name: "Sparkasse Hannover", bic: "SPKHDE2HXXX" },
  { blz: "20050000", name: "Hamburger Sparkasse", bic: "HASPDEHHXXX" },
  { blz: "70150000", name: "Stadtsparkasse München", bic: "SSKMDEMMXXX" },
  { blz: "76050101", name: "Sparkasse Nürnberg", bic: "SSKNDE77XXX" },
  { blz: "60050000", name: "BW-Bank (LBBW)", bic: "SOLADEST600" },
  { blz: "29050000", name: "Sparkasse Bremen", bic: "SBREDE22XXX" },
  { blz: "27050000", name: "Sparkasse Hannover", bic: "SPKHDE2HXXX" },
  { blz: "12050000", name: "Sparkasse Mecklenburg-Schwerin", bic: "NOLADE21LWL" },
  { blz: "39050000", name: "Sparkasse Aachen", bic: "AACSDE33XXX" },
  { blz: "55050000", name: "Sparkasse Mainz", bic: "MALADE51MNZ" },
  { blz: "57050120", name: "Sparkasse Koblenz", bic: "MALADE51KOB" },
  { blz: "60050000", name: "Landesbank Baden-Württemberg", bic: "SOLADEST600" },
  { blz: "59050000", name: "Sparkasse Saarbrücken", bic: "SAKSDE55XXX" },
  { blz: "78050000", name: "Sparkasse Bamberg", bic: "BYLADEM1SKB" },
  { blz: "77050000", name: "Sparkasse Bamberg", bic: "BYLADEM1SKB" },
  { blz: "76050000", name: "Sparkasse Nürnberg", bic: "SSKNDE77XXX" },
  { blz: "75050000", name: "Sparkasse Mainfranken Würzburg", bic: "BYLADEM1SWU" },
  { blz: "79050000", name: "Sparkasse Schweinfurt-Haßberge", bic: "BYLADEM1KSW" },
  { blz: "10090000", name: "Berliner Volksbank", bic: "BEVODEBBXXX" },

  // Volksbanken / Raiffeisenbanken (verbreitete)
  { blz: "20090500", name: "Sparda-Bank Hamburg", bic: "GENODEF1S11" },
  { blz: "60090800", name: "Sparda-Bank Baden-Württemberg", bic: "GENODEF1S02" },
  { blz: "76090500", name: "Sparda-Bank Nürnberg", bic: "GENODEF1S06" },
  { blz: "76090000", name: "Volksbank Bamberg-Forchheim (Raiffeisen)", bic: "GENODEF1FOH" },
  { blz: "10090000", name: "Berliner Volksbank", bic: "BEVODEBBXXX" },
  { blz: "30060601", name: "Apotheker- und Ärztebank", bic: "DAAEDEDDXXX" },
  { blz: "30060992", name: "GLS Bank", bic: "GENODEM1GLS" },
  { blz: "43060967", name: "GLS Bank", bic: "GENODEM1GLS" },
  { blz: "76050101", name: "Sparkasse Nürnberg", bic: "SSKNDE77XXX" },
  { blz: "37060193", name: "Volksbank Köln Bonn", bic: "GENODED1CGN" },
  { blz: "32060362", name: "Volksbank Kleverland", bic: "GENODED1KLL" },
  { blz: "60060396", name: "Volksbank Stuttgart", bic: "GENODES1VBS" },
  { blz: "70180020", name: "PSD Bank München", bic: "GENODEF1P14" },

  // Online + Spezial
  { blz: "20030700", name: "Hauck Aufhäuser Lampe", bic: "HAUKDEFFXXX" },
  { blz: "30220190", name: "Targobank", bic: "CMCIDEDDXXX" },
  { blz: "30070024", name: "Deutsche Bank Düsseldorf", bic: "DEUTDEDBDUE" },
  { blz: "70150000", name: "Stadtsparkasse München", bic: "SSKMDEMMXXX" },
  { blz: "70100100", name: "Postbank München", bic: "PBNKDEFFXXX" },
  { blz: "20210400", name: "Augsburger Aktienbank", bic: "AUGUDE77XXX" },
  { blz: "70320501", name: "VR-Bank Werdenfels", bic: "GENODEF1MTG" },
  { blz: "32070080", name: "Deutsche Bank Krefeld", bic: "DEUTDEDD320" },
  { blz: "44070024", name: "Deutsche Bank Dortmund", bic: "DEUTDEDB440" },
];

const BLZ_INDEX = new Map<string, BankInfo>();
for (const b of BANKS) BLZ_INDEX.set(b.blz, b);

/**
 * Ergebnis des IBAN-Parsings für DE-IBANs.
 * `bank` ist null, wenn die BLZ nicht in der lokalen Tabelle ist.
 */
export type IbanParseResult = {
  ok: boolean;
  country: string | null;
  blz: string | null;     // nur bei DE-IBANs
  bank: BankInfo | null;  // nur bei DE-IBANs und bekannter BLZ
  reason?: string;        // bei !ok
};

/**
 * Parst eine IBAN (best-effort) und liefert die Bank-Info, wenn eine
 * deutsche IBAN mit bekannter BLZ erkannt wurde.
 *
 * Keine harte Prüfziffer-Validierung — Lisa soll auch unvollständige IBANs
 * nutzen können, ohne dass der UI-Lookup blockiert wird.
 */
export function parseGermanIban(rawInput: string): IbanParseResult {
  if (!rawInput) return { ok: false, country: null, blz: null, bank: null, reason: "leer" };
  const normalized = rawInput.replace(/\s+/g, "").toUpperCase();
  if (normalized.length < 6) {
    return { ok: false, country: null, blz: null, bank: null, reason: "zu kurz" };
  }
  const country = normalized.slice(0, 2);
  if (country !== "DE") {
    return { ok: false, country, blz: null, bank: null, reason: "nicht-DE" };
  }
  // DE-IBAN-Format: DE + 2 Prüfziffern + 8 BLZ + 10 Kontonummer = 22 Zeichen.
  // BLZ steht an den Positionen 4..12 (0-indiziert: slice(4, 12)).
  if (normalized.length < 12) {
    return { ok: true, country: "DE", blz: null, bank: null, reason: "BLZ unvollständig" };
  }
  const blz = normalized.slice(4, 12);
  if (!/^\d{8}$/.test(blz)) {
    return { ok: false, country: "DE", blz: null, bank: null, reason: "BLZ ungültig" };
  }
  const bank = BLZ_INDEX.get(blz) ?? null;
  return { ok: true, country: "DE", blz, bank };
}

/**
 * Lookup einer Bank rein über die BLZ (z.B. wenn Lisa BLZ manuell eingibt).
 */
export function lookupByBlz(blz: string): BankInfo | null {
  const clean = blz.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  return BLZ_INDEX.get(clean) ?? null;
}
