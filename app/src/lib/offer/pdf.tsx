// PDF-Layout für Angebote — DIN 5008 Form A, baut auf der Theme-Engine
// der Rechnungs-PDF auf (createStyles + ThemeConfig in lib/invoice/pdf.tsx).
//
// Wesentliche Unterschiede zur Rechnung:
//  - Titel „Angebot" statt „Rechnung Nr. XX"
//  - Optionaler Intro-Text vor der Tabelle
//  - Keine USt-/Mahnungs-/Bezahllink-spezifischen Sektionen
//  - Schlusstext mit Hinweis auf Gültigkeitsdatum statt Zahlungsfrist
//  - Optionaler „Hinweise/Bedingungen"-Block unterhalb der Summen

import {
  Document, Page, Text, View, Image, StyleSheet, renderToStream,
} from "@react-pdf/renderer";
import React from "react";
import { eurFromCents } from "../money";
import type { IssuerSnapshot } from "../invoiceSnapshot";

const mm = (n: number) => n * 2.83465;

const ink = "#19191A";
const smoke = "#7D7878";
const stone = "#CFCEC9";
const lineGrey = "#A6A4A0";

// Theme-Definitionen identisch zur Rechnung — Lisa wählt EIN Design, das
// sowohl für Rechnungen als auch Angebote gilt.
export type OfferDesign = "classic" | "elegant" | "modern";

type ThemeConfig = {
  accent: string;
  accentSoft: string;
  infoBoxBg: string;
  headingFont: string;
  titleFont: string;
  titleSize: number;
  showTitleBar: boolean;
};

const THEMES: Record<OfferDesign, ThemeConfig> = {
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
    accent: "#8C5A35",
    accentSoft: "#F4ECDF",
    infoBoxBg: "#F8F4ED",
    headingFont: "Times-Bold",
    titleFont: "Times-Bold",
    titleSize: 22,
    showTitleBar: false,
  },
  modern: {
    accent: "#19191A",
    accentSoft: "#E9E9E9",
    infoBoxBg: "#F2F1EE",
    headingFont: "Helvetica-Bold",
    titleFont: "Helvetica-Bold",
    titleSize: 24,
    showTitleBar: true,
  },
};

export type OfferForPdf = {
  number: string | null;
  status: string;
  issueDate: Date;
  validUntil: Date | null;
  recipientName: string;
  recipientAddress: string;
  title: string;
  intro: string | null;
  notes: string | null;
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
  isSmallBusiness: boolean;
  logoBuffer?: Buffer | null;
  logoFormat?: "png" | "jpg" | null;
  design?: string | null;
};

function createStyles(theme: ThemeConfig) {
  const accent = theme.accent;
  return StyleSheet.create({
    page: {
      paddingTop: mm(108),
      paddingBottom: mm(38),
      paddingLeft: mm(25),
      paddingRight: mm(20),
      fontSize: 10,
      color: ink,
      fontFamily: "Helvetica",
      lineHeight: 1.45,
    },
    logoBlock: { position: "absolute", top: mm(15), right: mm(20), width: mm(85), alignItems: "flex-end" },
    logoName: { fontSize: 16, fontFamily: theme.headingFont, letterSpacing: 0.5, textAlign: "right" },
    logoOwner: { fontSize: 9, color: smoke, marginTop: 2, textAlign: "right" },
    addressField: { position: "absolute", top: mm(27), left: mm(25), width: mm(85), height: mm(45) },
    miniSender: { fontSize: 7, color: smoke, marginBottom: 4 },
    recipientLine: { fontSize: 11, marginBottom: 1.5, lineHeight: 1.25 },
    recipientLineBold: { fontSize: 11, fontFamily: theme.headingFont, marginBottom: 1.5, lineHeight: 1.25 },
    referenceBlock: { position: "absolute", top: mm(82), right: mm(20), width: mm(85), alignItems: "flex-end" },
    referenceLine: { fontSize: 10.5, marginBottom: 1 },
    referenceLineEm: { fontSize: 10.5, fontFamily: theme.headingFont, marginBottom: 1 },
    referenceHint: { fontSize: 8.5, color: smoke, marginTop: 3 },
    docTitle: { fontSize: theme.titleSize, fontFamily: theme.titleFont, marginBottom: 14 },
    titleBar: { width: mm(8), height: mm(9), backgroundColor: accent, marginRight: mm(4) },
    titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    intro: { fontSize: 10.5, marginBottom: 18, lineHeight: 1.5 },
    table: { marginBottom: 8 },
    tableHead: { flexDirection: "row", backgroundColor: theme.infoBoxBg, paddingVertical: 6, paddingHorizontal: 4 },
    tableHeadCell: { fontSize: 9, fontFamily: theme.headingFont, color: ink },
    tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 0.4, borderBottomColor: stone },
    cPos: { width: "8%" },
    cQty: { width: "10%" },
    cUnit: { width: "12%" },
    cDesc: { width: "40%" },
    cUnitPrice: { width: "15%", textAlign: "right" },
    cTotal: { width: "15%", textAlign: "right" },
    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
    totals: { width: "55%" },
    totalLine: {
      flexDirection: "row", justifyContent: "space-between", paddingVertical: 5,
      paddingHorizontal: 4, borderBottomWidth: 0.4, borderBottomColor: stone,
    },
    totalLabel: { fontSize: 10 },
    totalValue: { fontSize: 10 },
    totalGrand: {
      flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 4,
      marginTop: 2, borderTopWidth: 1, borderTopColor: ink, borderBottomWidth: 1, borderBottomColor: ink,
      fontFamily: theme.headingFont, fontSize: 11.5,
    },
    noteBox: { marginTop: 18, padding: 10, backgroundColor: theme.accentSoft, borderLeftWidth: 2, borderLeftColor: accent, fontSize: 9.5 },
    infoBox: { marginTop: 10, padding: 9, backgroundColor: theme.infoBoxBg, fontSize: 9.5, color: ink },
    closing: { marginTop: 20, fontSize: 10.5, lineHeight: 1.5 },
    signature: { marginTop: 18, fontSize: 10.5 },
    footer: {
      position: "absolute", bottom: mm(12), left: mm(25), right: mm(20),
      flexDirection: "row", justifyContent: "space-between", paddingTop: 6,
      borderTopWidth: 0.4, borderTopColor: lineGrey, fontSize: 7.5, color: smoke, lineHeight: 1.45,
    },
    footerCol: { width: "32%" },
    footerColTitle: { fontFamily: theme.headingFont, color: ink, marginBottom: 2, fontSize: 7.5 },
    pageNum: { position: "absolute", bottom: mm(4), right: mm(20), fontSize: 7, color: smoke },
  });
}

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

function miniSender(i: IssuerSnapshot): string {
  return [i.companyName, i.street, [i.zip, i.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

function resolveTheme(design: string | null | undefined): ThemeConfig {
  const key: OfferDesign = design === "elegant" || design === "modern" ? design : "classic";
  return THEMES[key];
}

function OfferPage({ offer, theme, s }: { offer: OfferForPdf; theme: ThemeConfig; s: ReturnType<typeof createStyles> }) {
  const showVat = !offer.isSmallBusiness;
  const ownerName = offer.issuer.accountName || offer.issuer.owner || offer.issuer.companyName;
  const intro = offer.intro
    ?? "Vielen lieben Dank für dein Interesse — hier mein Vorschlag für dein Shooting:";
  const closing = offer.validUntil
    ? `Dieses Angebot ist gültig bis zum ${fmtDate(offer.validUntil)}. Melde dich gern, wenn du Fragen hast oder es annehmen möchtest.`
    : "Melde dich gern, wenn du Fragen hast oder das Angebot annehmen möchtest.";

  return (
    <Page size="A4" style={s.page}>
      <View style={s.logoBlock} fixed>
        {offer.logoBuffer ? (
          <Image
            src={{ data: offer.logoBuffer, format: offer.logoFormat ?? "png" }}
            style={{ maxHeight: mm(20), maxWidth: mm(60), objectFit: "contain" }}
          />
        ) : (
          <>
            <Text style={s.logoName}>{offer.issuer.companyName || "—"}</Text>
            {offer.issuer.owner && offer.issuer.owner !== offer.issuer.companyName && (
              <Text style={s.logoOwner}>Inh. {offer.issuer.owner}</Text>
            )}
          </>
        )}
      </View>

      <View style={s.addressField}>
        <Text style={s.miniSender}>{miniSender(offer.issuer)}</Text>
        <Text style={s.recipientLineBold}>{offer.recipientName}</Text>
        {offer.recipientAddress.split("\n").map((line, i) => (
          <Text key={i} style={s.recipientLine}>{line}</Text>
        ))}
      </View>

      <View style={s.referenceBlock}>
        <Text style={s.referenceLine}>Datum: {fmtDate(offer.issueDate)}</Text>
        <Text style={s.referenceLineEm}>
          Angebotsnummer: {offer.number ?? "(Entwurf)"}
        </Text>
        {offer.validUntil && (
          <Text style={s.referenceLine}>Gültig bis: {fmtDate(offer.validUntil)}</Text>
        )}
      </View>

      {theme.showTitleBar ? (
        <View style={s.titleRow}>
          <View style={s.titleBar} />
          <Text style={[s.docTitle, { marginBottom: 0 }]}>{offer.title || "Angebot"}</Text>
        </View>
      ) : (
        <Text style={s.docTitle}>{offer.title || "Angebot"}</Text>
      )}
      <Text style={s.intro}>{intro}</Text>

      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.tableHeadCell, s.cPos]}>Position</Text>
          <Text style={[s.tableHeadCell, s.cQty]}>Anzahl</Text>
          <Text style={[s.tableHeadCell, s.cUnit]}>Einheit</Text>
          <Text style={[s.tableHeadCell, s.cDesc]}>Bezeichnung</Text>
          <Text style={[s.tableHeadCell, s.cUnitPrice]}>Einzelpreis</Text>
          <Text style={[s.tableHeadCell, s.cTotal]}>Gesamtpreis</Text>
        </View>
        {offer.items.map((it, i) => (
          <View key={i} style={s.tableRow} wrap={false}>
            <Text style={s.cPos}>{i + 1}</Text>
            <Text style={s.cQty}>{it.quantity}</Text>
            <Text style={s.cUnit}>{it.unit ?? ""}</Text>
            <Text style={s.cDesc}>
              {it.title}
              {it.description ? `\n${it.description}` : ""}
            </Text>
            <Text style={s.cUnitPrice}>{eurFromCents(it.unitPriceCents)}</Text>
            <Text style={s.cTotal}>{eurFromCents(it.totalCents)}</Text>
          </View>
        ))}
      </View>

      <View style={s.totalsWrap}>
        <View style={s.totals}>
          {showVat ? (
            <>
              <View style={s.totalLine}>
                <Text style={s.totalLabel}>Nettopreis</Text>
                <Text style={s.totalValue}>{eurFromCents(offer.subtotalCents)}</Text>
              </View>
              <View style={s.totalLine}>
                <Text style={s.totalLabel}>Zzgl. {offer.vatRate} % USt.</Text>
                <Text style={s.totalValue}>{eurFromCents(offer.vatAmountCents)}</Text>
              </View>
              <View style={s.totalGrand}>
                <Text>Gesamtsumme</Text>
                <Text>{eurFromCents(offer.totalCents)}</Text>
              </View>
            </>
          ) : (
            <View style={s.totalGrand}>
              <Text>Gesamtsumme</Text>
              <Text>{eurFromCents(offer.totalCents)}</Text>
            </View>
          )}
        </View>
      </View>

      {offer.isSmallBusiness && (
        <View style={s.infoBox}>
          <Text>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).</Text>
        </View>
      )}

      {offer.notes && (
        <View style={s.noteBox}>
          <Text>{offer.notes}</Text>
        </View>
      )}

      <Text style={s.closing}>{closing}</Text>
      <View style={s.signature}>
        <Text>Herzliche Grüße</Text>
        <Text style={{ marginTop: 14 }}>{ownerName}</Text>
      </View>

      <View style={s.footer} fixed>
        <View style={s.footerCol}>
          <Text style={s.footerColTitle}>{offer.issuer.companyName || "—"}</Text>
          {offer.issuer.street && <Text>{offer.issuer.street}</Text>}
          {(offer.issuer.zip || offer.issuer.city) && (
            <Text>{[offer.issuer.zip, offer.issuer.city].filter(Boolean).join(" ")}</Text>
          )}
          {offer.issuer.phone && <Text>Tel.: {offer.issuer.phone}</Text>}
          {offer.issuer.email && <Text>E-Mail: {offer.issuer.email}</Text>}
        </View>
        <View style={s.footerCol}>
          <Text style={s.footerColTitle}>Steuerliche Angaben</Text>
          {offer.issuer.taxId && <Text>Steuer-Nr.: {offer.issuer.taxId}</Text>}
          {offer.issuer.vatId && <Text>USt-IdNr.: {offer.issuer.vatId}</Text>}
          {offer.issuer.owner && <Text>Inhaber/in: {offer.issuer.owner}</Text>}
        </View>
        <View style={s.footerCol}>
          {offer.issuer.footerNote && (
            <Text style={{ fontStyle: "italic" }}>{offer.issuer.footerNote}</Text>
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

export function OfferDocument({ offer, design }: { offer: OfferForPdf; design?: string | null }) {
  const theme = resolveTheme(design);
  const s = createStyles(theme);
  return (
    <Document title={offer.number ? `Angebot ${offer.number}` : `Angebot (Entwurf)`}>
      <OfferPage offer={offer} theme={theme} s={s} />
    </Document>
  );
}

export async function renderOfferPdf(offer: OfferForPdf, design?: string | null): Promise<NodeJS.ReadableStream> {
  return await renderToStream(<OfferDocument offer={offer} design={design ?? offer.design} />);
}
