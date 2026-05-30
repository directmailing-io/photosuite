// PDF-Generator für Mahnungen (Zahlungserinnerung, 1./2. Mahnung).
// Aufbau identisch zur Rechnung (DIN 5008 Form A), aber:
//   - Titel je nach Mahnstufe
//   - Verweis auf Original-Rechnung
//   - Mahngebühr als zusätzliche Position
//   - Neue Zahlungsfrist
//   - Stufenspezifischer Text (höflicher Ton bei Erinnerung, deutlicher bei Mahnungen)
import {
  Document, Page, Text, View, StyleSheet, renderToStream,
} from "@react-pdf/renderer";
import React from "react";
import { eurFromCents } from "../money";
import type { IssuerSnapshot } from "../invoiceSnapshot";

const mm = (n: number) => n * 2.83465;

export type ReminderForPdf = {
  level: number;                 // 1, 2, 3
  feeCents: number;
  newDueDate: Date;
  issuedAt: Date;
  invoice: {
    number: string;
    issueDate: Date;
    dueDate: Date;
    totalCents: number;
    amountDueCents: number;
    recipientName: string;
    recipientAddress: string;
    issuer: IssuerSnapshot;
  };
};

const ink = "#19191A";
const smoke = "#7D7878";
const stone = "#CFCEC9";
const lineGrey = "#A6A4A0";
const accent = "#C8102E";

const s = StyleSheet.create({
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
  logoName: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "right", letterSpacing: 0.5 },
  logoOwner: { fontSize: 9, color: smoke, marginTop: 2, textAlign: "right" },

  addressField: { position: "absolute", top: mm(27), left: mm(25), width: mm(85), height: mm(45) },
  miniSender: { fontSize: 7, color: smoke, marginBottom: 4 },
  recipientLine: { fontSize: 11, marginBottom: 1.5, lineHeight: 1.25 },
  recipientLineBold: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 1.5, lineHeight: 1.25 },

  referenceBlock: { position: "absolute", top: mm(82), right: mm(20), width: mm(85), alignItems: "flex-end" },
  referenceLine: { fontSize: 10.5, marginBottom: 1 },
  referenceLineEm: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 1 },

  docTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 14 },
  intro: { fontSize: 10.5, marginBottom: 14, lineHeight: 1.55 },

  table: { marginBottom: 8, marginTop: 6 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#F2F1EE",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeadCell: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ink },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 0.4,
    borderBottomColor: stone,
  },
  cLeft: { width: "70%" },
  cRight: { width: "30%", textAlign: "right" },

  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: accent,
    borderBottomWidth: 1,
    borderBottomColor: accent,
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: accent,
  },
  noteBox: {
    marginTop: 18,
    padding: 10,
    backgroundColor: "#FBE9EC",
    borderLeftWidth: 2,
    borderLeftColor: accent,
    fontSize: 9.5,
  },
  closing: { marginTop: 20, fontSize: 10.5, lineHeight: 1.55 },
  signature: { marginTop: 18, fontSize: 10.5 },

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
  },
  footerCol: { width: "32%" },
  footerColTitle: { fontFamily: "Helvetica-Bold", color: ink, marginBottom: 2, fontSize: 7.5 },
});

const fmtDate = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function miniSender(i: IssuerSnapshot): string {
  return [i.companyName, i.street, [i.zip, i.city].filter(Boolean).join(" ")]
    .filter(Boolean).join(" · ");
}

function levelMeta(level: number): { title: string; intro: string; legal: string | null } {
  switch (level) {
    case 1:
      return {
        title: "Zahlungserinnerung",
        intro: "uns ist aufgefallen, dass die unten genannte Rechnung noch offen ist. Vielleicht ist sie im Alltag untergegangen — kein Problem, das passiert. Wir bitten dich, den offenen Betrag bis zum unten genannten Datum zu begleichen.",
        legal: null,
      };
    case 2:
      return {
        title: "1. Mahnung",
        intro: "trotz unserer Zahlungserinnerung ist die unten genannte Rechnung noch offen. Wir bitten dich, den offenen Betrag inkl. der ausgewiesenen Mahngebühr bis zum unten genannten Datum auf das im Briefkopf angegebene Konto zu überweisen.",
        legal: "Sollte die Zahlung trotz dieser Mahnung ausbleiben, sehen wir uns gezwungen, weitere Schritte einzuleiten.",
      };
    case 3:
      return {
        title: "2. Mahnung — Letzte Aufforderung",
        intro: "die unten genannte Rechnung ist trotz Zahlungserinnerung und 1. Mahnung weiterhin nicht beglichen. Dies ist die letzte außergerichtliche Aufforderung. Bitte überweise den offenen Gesamtbetrag inkl. Mahngebühr bis zum unten genannten Datum.",
        legal: "Sollte die Zahlung bis dahin nicht eingehen, geben wir den Vorgang ohne weitere Ankündigung an ein Inkassobüro ab. Die dadurch entstehenden zusätzlichen Kosten sowie gesetzliche Verzugszinsen (§ 288 BGB) sind dann von dir zu tragen.",
      };
    default:
      return { title: "Zahlungserinnerung", intro: "", legal: null };
  }
}

export function ReminderDocument({ reminder }: { reminder: ReminderForPdf }) {
  const m = levelMeta(reminder.level);
  const inv = reminder.invoice;
  const issuer = inv.issuer;
  const totalWithFee = inv.amountDueCents + reminder.feeCents;
  const ownerName = issuer.owner || issuer.companyName;

  return (
    <Document title={`${m.title} zu Rechnung ${inv.number}`}>
      <Page size="A4" style={s.page}>
        {/* Briefkopf rechts */}
        <View style={s.logoBlock} fixed>
          <Text style={s.logoName}>{issuer.companyName}</Text>
          {issuer.owner && issuer.owner !== issuer.companyName && (
            <Text style={s.logoOwner}>Inh. {issuer.owner}</Text>
          )}
        </View>

        {/* Anschriftenfeld */}
        <View style={s.addressField}>
          <Text style={s.miniSender}>{miniSender(issuer)}</Text>
          <Text style={s.recipientLineBold}>{inv.recipientName}</Text>
          {inv.recipientAddress.split("\n").map((line, i) => (
            <Text key={i} style={s.recipientLine}>{line}</Text>
          ))}
        </View>

        {/* Bezugszeile */}
        <View style={s.referenceBlock}>
          <Text style={s.referenceLine}>Datum: {fmtDate(reminder.issuedAt)}</Text>
          <Text style={s.referenceLineEm}>
            zu Rechnung Nr. {inv.number}
          </Text>
          <Text style={s.referenceLine}>vom {fmtDate(inv.issueDate)}</Text>
          <Text style={[s.referenceLine, { color: accent, fontFamily: "Helvetica-Bold", marginTop: 4 }]}>
            Neue Frist: {fmtDate(reminder.newDueDate)}
          </Text>
        </View>

        <Text style={s.docTitle}>{m.title}</Text>
        <Text style={s.intro}>{m.intro}</Text>

        {/* Tabelle */}
        <View style={s.table}>
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, s.cLeft]}>Forderung</Text>
            <Text style={[s.tableHeadCell, s.cRight]}>Betrag</Text>
          </View>
          <View style={s.tableRow}>
            <Text style={s.cLeft}>
              Offener Rechnungsbetrag — Rechnung Nr. {inv.number} vom {fmtDate(inv.issueDate)}
              {"\n"}
              <Text style={{ fontSize: 8.5, color: smoke }}>
                ursprünglich fällig am {fmtDate(inv.dueDate)}
              </Text>
            </Text>
            <Text style={s.cRight}>{eurFromCents(inv.amountDueCents)}</Text>
          </View>
          {reminder.feeCents > 0 && (
            <View style={s.tableRow}>
              <Text style={s.cLeft}>Mahngebühr ({m.title})</Text>
              <Text style={s.cRight}>{eurFromCents(reminder.feeCents)}</Text>
            </View>
          )}
        </View>

        <View style={s.totalGrand}>
          <Text>Gesamt zu zahlen bis {fmtDate(reminder.newDueDate)}</Text>
          <Text>{eurFromCents(totalWithFee)}</Text>
        </View>

        {m.legal && (
          <View style={s.noteBox}>
            <Text>{m.legal}</Text>
          </View>
        )}

        <Text style={s.closing}>
          Sollte sich dein Schreiben mit unserem überschnitten haben, betrachte diese Mahnung bitte als gegenstandslos.
          Bei Rückfragen oder wenn du eine Ratenzahlung wünschst, melde dich gerne jederzeit bei uns.
        </Text>
        <View style={s.signature}>
          <Text>Mit freundlichen Grüßen</Text>
          <Text style={{ marginTop: 14 }}>{ownerName}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={s.footerCol}>
            <Text style={s.footerColTitle}>{issuer.companyName}</Text>
            {issuer.street && <Text>{issuer.street}</Text>}
            {(issuer.zip || issuer.city) && (
              <Text>{[issuer.zip, issuer.city].filter(Boolean).join(" ")}</Text>
            )}
            {issuer.phone && <Text>Tel.: {issuer.phone}</Text>}
            {issuer.email && <Text>E-Mail: {issuer.email}</Text>}
          </View>
          <View style={s.footerCol}>
            <Text style={s.footerColTitle}>Bankverbindung</Text>
            {issuer.bankName && <Text>Kreditinstitut: {issuer.bankName}</Text>}
            {issuer.iban && <Text>IBAN: {issuer.iban}</Text>}
            {issuer.bic && <Text>BIC: {issuer.bic}</Text>}
            <Text>Kto.-Inh.: {ownerName}</Text>
          </View>
          <View style={s.footerCol}>
            <Text style={s.footerColTitle}>Steuerliche Angaben</Text>
            {issuer.taxId && <Text>Steuer-Nr.: {issuer.taxId}</Text>}
            {issuer.vatId && <Text>USt-IdNr.: {issuer.vatId}</Text>}
            {issuer.owner && <Text>Inhaber/in: {issuer.owner}</Text>}
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReminderPdf(reminder: ReminderForPdf): Promise<NodeJS.ReadableStream> {
  return await renderToStream(<ReminderDocument reminder={reminder} />);
}
