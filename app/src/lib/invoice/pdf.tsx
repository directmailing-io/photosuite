// PDF-Layout für Rechnungen — DIN 5008 Form A (Standard-Geschäftsbrief).
//
// Maßgaben (so dass die Rechnung in DL- und C6/5-Sichtfenster-Umschläge passt):
//   - Linker Rand: 25 mm, Rechter Rand: 20 mm
//   - Anschriftenfeld: top 27 mm, links 25 mm, 85 × 45 mm
//     - Rücksendeangabe (Mini-Absender): erste ~5 mm, Schrift max 8 pt
//     - Anschrift: 6 Zeilen, ab ~17.7 mm im Anschriftenfeld
//   - Bezugszeile (Datum/Nr.): ab 97 mm von oben
//   - Logo/Briefkopf-Bereich: 0–27 mm (oben rechts, keine Adress-Doublette)
//   - Footer: fixiert, fortlaufend auf jeder Seite
import {
  Document, Page, Text, View, Image, StyleSheet, renderToStream,
} from "@react-pdf/renderer";
import React from "react";
import { eurFromCents } from "../money";
import type { IssuerSnapshot } from "../invoiceSnapshot";

// 1 mm = 2.83465 pt
const mm = (n: number) => n * 2.83465;

// ---------- Typen ----------
export type InvoiceForPdf = {
  number: string | null;
  kind: string; // DEPOSIT | INTERIM | FINAL | CANCEL
  status: string;
  issueDate: Date;
  serviceDate: Date | null;
  serviceDateEnd: Date | null;
  dueDate: Date;
  recipientName: string;
  recipientAddress: string;
  issuer: IssuerSnapshot;
  items: Array<{
    title: string;
    description: string | null;
    quantity: number;
    unit: string | null;
    unitPriceCents: number;
    totalCents: number;
  }>;
  subtotalCents: number;
  vatRate: number;
  vatAmountCents: number;
  totalCents: number;
  prepaidCents: number;
  amountDueCents: number;
  isSmallBusiness: boolean;
  internalNote: string | null;
  prepaidInvoices?: Array<{
    number: string;
    issueDate: Date;
    netCents: number;
    vatCents: number;
    grossCents: number;
  }>;
  cancelsInvoice?: { number: string; issueDate: Date } | null;
  // Logo wird beim Render vom Disk geladen (siehe loadLogoBuffer in load.ts) und hier reingereicht.
  logoBuffer?: Buffer | null;
  logoFormat?: "png" | "jpg" | null;
  // Design-Variante (classic | elegant | modern). Default: classic.
  design?: string | null;
};

// ---------- Farben ----------
const ink = "#19191A";
const smoke = "#7D7878";
const stone = "#CFCEC9";
const lineGrey = "#A6A4A0";

// ---------- Designs ----------
// Lisa kann das Rechnungs-Design pro User in den Einstellungen wählen.
// Jedes Design definiert nur die Variationen über dem DIN-5008-Layout:
// Akzentfarbe, Heading-Font und ein optionaler Akzent-Balken am Titel.
export type InvoiceDesign = "classic" | "elegant" | "modern";

type ThemeConfig = {
  accent: string;
  accentSoft: string;     // Hintergrund für noteBox
  infoBoxBg: string;      // Hintergrund für infoBox + tableHead
  headingFont: string;    // Document/Section-Headings
  titleFont: string;      // Großer Rechnungs-Titel
  titleSize: number;
  showTitleBar: boolean;  // dicke Akzentleiste links vom Titel
};

const THEMES: Record<InvoiceDesign, ThemeConfig> = {
  classic: {
    accent: "#C8102E",
    accentSoft: "#FBE9EC",
    infoBoxBg: "#F2F1EE",
    headingFont: "Helvetica-Bold",
    titleFont: "Helvetica-Bold",
    titleSize: 20,
    showTitleBar: false,
  },
  elegant: {
    accent: "#8C5A35",   // warmer Bronze
    accentSoft: "#F4ECDF",
    infoBoxBg: "#F8F4ED",
    headingFont: "Times-Bold",
    titleFont: "Times-Bold",
    titleSize: 22,
    showTitleBar: false,
  },
  modern: {
    accent: "#19191A",   // ink-schwarz, kräftig
    accentSoft: "#E9E9E9",
    infoBoxBg: "#F2F1EE",
    headingFont: "Helvetica-Bold",
    titleFont: "Helvetica-Bold",
    titleSize: 24,
    showTitleBar: true,
  },
};

function createStyles(theme: ThemeConfig) {
  const accent = theme.accent;
  return StyleSheet.create({
  page: {
    // Body beginnt ab 110 mm, damit Anschriftenfeld + Bezugszeile genug Platz haben
    paddingTop: mm(108),
    paddingBottom: mm(38),
    paddingLeft: mm(25),
    paddingRight: mm(20),
    fontSize: 10,
    color: ink,
    fontFamily: "Helvetica",
    lineHeight: 1.45,
  },

  // ---- Logo / Briefkopf oben rechts (NUR Name, keine Adresse — die steht im Footer + Bezugsfeld) ----
  logoBlock: {
    position: "absolute",
    top: mm(15),
    right: mm(20),
    width: mm(85),
    alignItems: "flex-end",
  },
  logoName: {
    fontSize: 16,
    fontFamily: theme.headingFont,
    letterSpacing: 0.5,
    textAlign: "right",
  },
  logoOwner: {
    fontSize: 9,
    color: smoke,
    marginTop: 2,
    textAlign: "right",
  },

  // ---- Anschriftenfeld (links, DIN 5008 Form A) ----
  addressField: {
    position: "absolute",
    top: mm(27),
    left: mm(25),
    width: mm(85),
    height: mm(45),
  },
  miniSender: {
    fontSize: 7,
    color: smoke,
    marginBottom: 4,
  },
  recipientLine: {
    fontSize: 11,
    marginBottom: 1.5,
    lineHeight: 1.25,
  },
  recipientLineBold: {
    fontSize: 11,
    fontFamily: theme.headingFont,
    marginBottom: 1.5,
    lineHeight: 1.25,
  },

  // ---- Bezugszeile (Datum, Nr.) rechtsbündig ----
  referenceBlock: {
    position: "absolute",
    top: mm(82),
    right: mm(20),
    width: mm(85),
    alignItems: "flex-end",
  },
  referenceLine: { fontSize: 10.5, marginBottom: 1 },
  referenceLineEm: { fontSize: 10.5, fontFamily: theme.headingFont, marginBottom: 1 },
  referenceHint: { fontSize: 8.5, color: smoke, marginTop: 3 },

  // ---- Titel + Brief ----
  docTitle: {
    fontSize: theme.titleSize,
    fontFamily: theme.titleFont,
    marginBottom: 14,
  },
  intro: { fontSize: 10.5, marginBottom: 18, lineHeight: 1.5 },

  // ---- Tabelle ----
  table: { marginBottom: 8 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: theme.infoBoxBg,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeadCell: {
    fontSize: 9,
    fontFamily: theme.headingFont,
    color: ink,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: stone,
  },
  cPos:       { width: "8%" },
  cQty:       { width: "10%" },
  cUnit:      { width: "12%" },
  cDesc:      { width: "40%" },
  cUnitPrice: { width: "15%", textAlign: "right" },
  cTotal:     { width: "15%", textAlign: "right" },

  // ---- Summen ----
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  totals: { width: "55%" },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: stone,
  },
  totalLabel: { fontSize: 10 },
  totalValue: { fontSize: 10 },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: ink,
    borderBottomWidth: 1,
    borderBottomColor: ink,
    fontFamily: theme.headingFont,
    fontSize: 11.5,
  },
  amountDueBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 1.2,
    borderTopColor: accent,
    fontFamily: theme.headingFont,
    fontSize: 12,
    color: accent,
  },

  // ---- Hinweise + Schlusstext ----
  noteBox: {
    marginTop: 18,
    padding: 10,
    backgroundColor: theme.accentSoft,
    borderLeftWidth: 2,
    borderLeftColor: accent,
    fontSize: 9.5,
  },
  infoBox: {
    marginTop: 10,
    padding: 9,
    backgroundColor: theme.infoBoxBg,
    fontSize: 9.5,
    color: ink,
  },
  closing: { marginTop: 20, fontSize: 10.5, lineHeight: 1.5 },
  signature: { marginTop: 18, fontSize: 10.5 },

  // ---- Footer ----
  footer: {
    position: "absolute",
    bottom: mm(12),
    left: mm(25),
    right: mm(20),
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 0.4,
    borderTopColor: lineGrey,
    fontSize: 7.5,
    color: smoke,
    lineHeight: 1.45,
  },
  footerCol: { width: "32%" },
  footerColTitle: {
    fontFamily: theme.headingFont,
    color: ink,
    marginBottom: 2,
    fontSize: 7.5,
  },
  // ---- Title-Bar (nur modern) ----
  titleBar: {
    width: mm(8),
    height: mm(9),
    backgroundColor: accent,
    marginRight: mm(4),
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  pageNum: {
    position: "absolute",
    bottom: mm(4),
    right: mm(20),
    fontSize: 7,
    color: smoke,
  },
});
}

// ---------- Helfer ----------
const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

function docMeta(kind: string): { title: string } {
  switch (kind) {
    case "DEPOSIT": return { title: "Anzahlungsrechnung" };
    case "INTERIM": return { title: "Teilrechnung" };
    case "FINAL":   return { title: "Rechnung" };
    case "CANCEL":  return { title: "Stornorechnung" };
    default:        return { title: "Rechnung" };
  }
}

function miniSender(i: IssuerSnapshot): string {
  return [
    i.companyName,
    i.street,
    [i.zip, i.city].filter(Boolean).join(" "),
  ].filter(Boolean).join(" · ");
}

function introText(kind: string, isFinalWithDeposit: boolean): string {
  if (kind === "CANCEL") {
    return "Hiermit stornieren wir die unten genannte Rechnung. Die Beträge werden mit umgekehrtem Vorzeichen ausgewiesen.";
  }
  if (kind === "DEPOSIT") {
    return "Vielen lieben Dank für deine Buchung. Vereinbarungsgemäß stellen wir dir hiermit die folgende Anzahlung in Rechnung. Die Schlussrechnung mit Verrechnung dieser Anzahlung folgt nach Erbringung der Leistung.";
  }
  if (isFinalWithDeposit) {
    return "Vielen lieben Dank für deine Buchung. Die unten genannte Leistung haben wir erbracht. Bereits geleistete Anzahlungen werden in dieser Schlussrechnung verrechnet.";
  }
  return "Vielen lieben Dank für deine Buchung. Vereinbarungsgemäß berechnen wir hiermit folgende Leistungen:";
}

function closingText(kind: string, dueDate: Date, issueDate: Date, ibanPresent: boolean): string {
  if (kind === "CANCEL") {
    return "Bei Rückfragen melde dich gerne jederzeit bei uns.";
  }
  const days = Math.max(1, Math.round((dueDate.getTime() - issueDate.getTime()) / 86400_000));
  const where = ibanPresent ? "auf das unten genannte Konto" : "wie vereinbart";
  return `Bitte überweise den Rechnungsbetrag innerhalb von ${days} Tagen ohne Abzug ${where}. Bei Fragen melde dich jederzeit gern bei uns.`;
}

// ---------- Komponente ----------
function InvoicePage({ invoice, theme, s }: { invoice: InvoiceForPdf; theme: ThemeConfig; s: ReturnType<typeof createStyles> }) {
  const meta = docMeta(invoice.kind);
  const isCancel = invoice.kind === "CANCEL";
  const showVat = !invoice.isSmallBusiness;
  const hasPrepaid = (invoice.prepaidInvoices?.length ?? 0) > 0 || invoice.prepaidCents > 0;
  const isFinalWithDeposit = invoice.kind === "FINAL" && hasPrepaid;
  const intro = introText(invoice.kind, isFinalWithDeposit);
  const closing = closingText(invoice.kind, invoice.dueDate, invoice.issueDate, !!invoice.issuer.iban);
  // Bankkonto-Inhaber:in: bevorzugt explizit angegeben, sonst Owner/Firmenname.
  const ownerName = invoice.issuer.accountName || invoice.issuer.owner || invoice.issuer.companyName;

  return (
    <Page size="A4" style={s.page}>

        {/* ===== Logo / Briefkopf oben rechts =====
             Wenn ein Raster-Logo (PNG/JPG) im Snapshot hinterlegt ist und der Renderer
             es als Buffer geladen hat, wird es angezeigt. Sonst fällt es auf den Text-Header zurück. */}
        <View style={s.logoBlock} fixed>
          {invoice.logoBuffer ? (
            <Image
              src={{ data: invoice.logoBuffer, format: invoice.logoFormat ?? "png" }}
              style={{ maxHeight: mm(20), maxWidth: mm(60), objectFit: "contain" }}
            />
          ) : (
            <>
              <Text style={s.logoName}>{invoice.issuer.companyName || "—"}</Text>
              {invoice.issuer.owner && invoice.issuer.owner !== invoice.issuer.companyName && (
                <Text style={s.logoOwner}>Inh. {invoice.issuer.owner}</Text>
              )}
            </>
          )}
        </View>

        {/* ===== Anschriftenfeld (DIN 5008 Form A: top 27mm, links 25mm, 85×45mm) ===== */}
        <View style={s.addressField}>
          <Text style={s.miniSender}>{miniSender(invoice.issuer)}</Text>
          <Text style={s.recipientLineBold}>{invoice.recipientName}</Text>
          {invoice.recipientAddress.split("\n").map((line, i) => (
            <Text key={i} style={s.recipientLine}>{line}</Text>
          ))}
        </View>

        {/* ===== Bezugszeile (rechts, ab ~82 mm — vor Bezugszeilen-Schwelle 97 mm) ===== */}
        <View style={s.referenceBlock}>
          <Text style={s.referenceLine}>Datum: {fmtDate(invoice.issueDate)}</Text>
          <Text style={s.referenceLineEm}>
            Rechnungsnummer: {invoice.number ?? "(Entwurf)"}
          </Text>
          {invoice.serviceDate ? (
            <Text style={s.referenceLine}>
              Leistungsdatum:{" "}
              {invoice.serviceDateEnd
                ? `${fmtDate(invoice.serviceDate)} – ${fmtDate(invoice.serviceDateEnd)}`
                : fmtDate(invoice.serviceDate)}
            </Text>
          ) : (
            !isCancel && (
              <Text style={s.referenceHint}>Rechnungsdatum entspricht Leistungsdatum</Text>
            )
          )}
        </View>

        {/* ===== Titel + Vorspann (ohne Anrede — Boudoir-Studio, persönlicher Ton) ===== */}
        {theme.showTitleBar ? (
          <View style={s.titleRow}>
            <View style={s.titleBar} />
            <Text style={[s.docTitle, { marginBottom: 0 }]}>{meta.title}</Text>
          </View>
        ) : (
          <Text style={s.docTitle}>{meta.title}</Text>
        )}
        <Text style={s.intro}>{intro}</Text>

        {/* ===== Storno-Verweis ===== */}
        {isCancel && invoice.cancelsInvoice && (
          <View style={s.noteBox}>
            <Text style={{ fontFamily: theme.headingFont, marginBottom: 3 }}>
              Storno der Rechnung Nr. {invoice.cancelsInvoice.number} vom {fmtDate(invoice.cancelsInvoice.issueDate)}
            </Text>
            <Text>
              Diese Stornorechnung hebt die oben genannte Rechnung in voller Höhe auf.
              Die Beträge werden mit umgekehrtem Vorzeichen ausgewiesen.
            </Text>
          </View>
        )}

        {/* ===== Tabelle ===== */}
        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, s.cPos]}>Position</Text>
            <Text style={[s.tableHeadCell, s.cQty]}>Anzahl</Text>
            <Text style={[s.tableHeadCell, s.cUnit]}>Einheit</Text>
            <Text style={[s.tableHeadCell, s.cDesc]}>Bezeichnung</Text>
            <Text style={[s.tableHeadCell, s.cUnitPrice]}>Einzelpreis</Text>
            <Text style={[s.tableHeadCell, s.cTotal]}>Gesamtpreis</Text>
          </View>
          {invoice.items.map((it, i) => (
            <View key={i} style={s.tableRow} wrap={false}>
              <Text style={s.cPos}>{i + 1}</Text>
              <Text style={s.cQty}>{it.quantity}</Text>
              <Text style={s.cUnit}>{it.unit ?? ""}</Text>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cUnitPrice}>{eurFromCents(it.unitPriceCents)}</Text>
              <Text style={s.cTotal}>{eurFromCents(it.totalCents)}</Text>
            </View>
          ))}
        </View>

        {/* ===== Summen ===== */}
        <View style={s.totalsWrap}>
          <View style={s.totals}>
            {showVat ? (
              <>
                <View style={s.totalLine}>
                  <Text style={s.totalLabel}>Nettopreis</Text>
                  <Text style={s.totalValue}>{eurFromCents(invoice.subtotalCents)}</Text>
                </View>
                <View style={s.totalLine}>
                  <Text style={s.totalLabel}>Zzgl. {invoice.vatRate} % USt.</Text>
                  <Text style={s.totalValue}>{eurFromCents(invoice.vatAmountCents)}</Text>
                </View>
                <View style={s.totalGrand}>
                  <Text>Rechnungsbetrag</Text>
                  <Text>{eurFromCents(invoice.totalCents)}</Text>
                </View>
              </>
            ) : (
              <View style={s.totalGrand}>
                <Text>Rechnungsbetrag</Text>
                <Text>{eurFromCents(invoice.totalCents)}</Text>
              </View>
            )}

            {invoice.prepaidInvoices && invoice.prepaidInvoices.length > 0 && (
              <>
                {invoice.prepaidInvoices.map((p, i) => (
                  <View key={i} style={s.totalLine}>
                    <Text style={s.totalLabel}>
                      ./. Anzahlung Rg. {p.number} v. {fmtDate(p.issueDate)}
                    </Text>
                    <Text style={s.totalValue}>-{eurFromCents(p.grossCents)}</Text>
                  </View>
                ))}
                <View style={s.amountDueBlock}>
                  <Text>Noch zu zahlen</Text>
                  <Text>{eurFromCents(invoice.amountDueCents)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {invoice.isSmallBusiness && (
          <View style={s.infoBox}>
            <Text>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</Text>
          </View>
        )}

        <Text style={s.closing}>{closing}</Text>
        <View style={s.signature}>
          <Text>Mit freundlichen Grüßen</Text>
          <Text style={{ marginTop: 14 }}>{ownerName}</Text>
        </View>

        {/* ===== Footer 3-spaltig (auf jeder Seite) ===== */}
        <View style={s.footer} fixed>
          <View style={s.footerCol}>
            <Text style={s.footerColTitle}>{invoice.issuer.companyName || "—"}</Text>
            {invoice.issuer.street && <Text>{invoice.issuer.street}</Text>}
            {(invoice.issuer.zip || invoice.issuer.city) && (
              <Text>{[invoice.issuer.zip, invoice.issuer.city].filter(Boolean).join(" ")}</Text>
            )}
            {invoice.issuer.phone && <Text>Tel.: {invoice.issuer.phone}</Text>}
            {invoice.issuer.email && <Text>E-Mail: {invoice.issuer.email}</Text>}
          </View>
          <View style={s.footerCol}>
            <Text style={s.footerColTitle}>Bankverbindung</Text>
            {invoice.issuer.bankName && <Text>Kreditinstitut: {invoice.issuer.bankName}</Text>}
            {invoice.issuer.iban && <Text>IBAN: {invoice.issuer.iban}</Text>}
            {invoice.issuer.bic && <Text>BIC: {invoice.issuer.bic}</Text>}
            <Text>Kto.-Inh.: {ownerName}</Text>
          </View>
          <View style={s.footerCol}>
            <Text style={s.footerColTitle}>Steuerliche Angaben</Text>
            {invoice.issuer.taxId && <Text>Steuer-Nr.: {invoice.issuer.taxId}</Text>}
            {invoice.issuer.vatId && <Text>USt-IdNr.: {invoice.issuer.vatId}</Text>}
            {invoice.issuer.owner && <Text>Inhaber/in: {invoice.issuer.owner}</Text>}
            {invoice.issuer.footerNote && (
              <Text style={{ marginTop: 2, fontStyle: "italic" }}>{invoice.issuer.footerNote}</Text>
            )}
          </View>
        </View>

        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Seite ${pageNumber} / ${totalPages}` : ""
          }
          fixed
        />
      </Page>
  );
}

function resolveTheme(design: string | null | undefined): ThemeConfig {
  const key: InvoiceDesign = design === "elegant" || design === "modern" ? design : "classic";
  return THEMES[key];
}

export function InvoiceDocument({ invoice, design }: { invoice: InvoiceForPdf; design?: string | null }) {
  const meta = docMeta(invoice.kind);
  const theme = resolveTheme(design);
  const s = createStyles(theme);
  return (
    <Document title={invoice.number ? `${meta.title} ${invoice.number}` : `${meta.title} (Entwurf)`}>
      <InvoicePage invoice={invoice} theme={theme} s={s} />
    </Document>
  );
}

// Beleg-Paket: Originalrechnung + Stornorechnung in einer PDF-Datei (zwei logische Seiten).
// Reihenfolge ist immer: Original zuerst, dann Storno — chronologisch und für Buchhaltung erwartbar.
export function CombinedInvoiceDocument({
  original, cancel, design,
}: { original: InvoiceForPdf; cancel: InvoiceForPdf; design?: string | null }) {
  const title = original.number && cancel.number
    ? `Rechnung ${original.number} + Storno ${cancel.number}`
    : "Beleg-Paket Rechnung + Storno";
  const theme = resolveTheme(design);
  const s = createStyles(theme);
  return (
    <Document title={title}>
      <InvoicePage invoice={original} theme={theme} s={s} />
      <InvoicePage invoice={cancel} theme={theme} s={s} />
    </Document>
  );
}

export async function renderInvoicePdf(invoice: InvoiceForPdf, design?: string | null): Promise<NodeJS.ReadableStream> {
  return await renderToStream(<InvoiceDocument invoice={invoice} design={design ?? invoice.design} />);
}

export async function renderCombinedInvoicePdf(
  original: InvoiceForPdf,
  cancel: InvoiceForPdf,
  design?: string | null,
): Promise<NodeJS.ReadableStream> {
  return await renderToStream(<CombinedInvoiceDocument original={original} cancel={cancel} design={design ?? original.design} />);
}
