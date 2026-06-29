import { Document, Page, View, Text, Image, StyleSheet, renderToStream } from "@react-pdf/renderer";

/**
 * Moodboard-PDF im A4-Querformat (297mm × 210mm).
 *
 * Layout:
 *   - Top: Eyebrow „Moodboard" + Shooting-Titel + Kundenname
 *   - Grid: 4 Spalten × 2 Zeilen = 8 Bilder pro Seite (Aspect 4:3 pro Slot)
 *   - Footer: Studio-Name + Datum
 *
 * Bei > 8 Bildern werden Folgeseiten automatisch erzeugt (chunked).
 * Slots mit fehlenden/fehlerhaften URLs werden als grauer Platzhalter gerendert.
 */

const PAGE_PADDING = 24;
const GRID_GAP = 12;
const GRID_COLS = 4;
const GRID_ROWS = 2;
const IMAGES_PER_PAGE = GRID_COLS * GRID_ROWS;

const s = StyleSheet.create({
  page: {
    backgroundColor: "#FFFCF8",
    padding: PAGE_PADDING,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 9,
    color: "#C8102E",
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  title: {
    fontSize: 22,
    color: "#19191A",
    marginTop: 4,
    fontFamily: "Helvetica",
  },
  subtitle: {
    fontSize: 10,
    color: "#7A746B",
    marginTop: 2,
  },
  meta: {
    fontSize: 9,
    color: "#7A746B",
    textAlign: "right",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
  },
  cell: {
    backgroundColor: "#F0EFE9",
    borderWidth: 1,
    borderColor: "#E4E2DA",
    borderRadius: 3,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#B0A096",
    fontSize: 9,
  },
  footer: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderColor: "#E4E2DA",
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#7A746B",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    color: "#7A746B",
  },
  emptyHint: {
    fontSize: 10,
    color: "#B0A096",
    marginTop: 6,
  },
});

export type MoodboardImage = { url: string; filename: string };

export type MoodboardData = {
  shootingTitle: string;
  customerName: string;
  studioName: string;
  images: MoodboardImage[];
};

// Slot-Größe für 4×2-Grid in A4-Quer mit Padding+Gap. Berechnet als Inline-Style,
// damit StyleSheet flexibel bleibt — A4-Quer ist 842pt × 595pt.
const PAGE_W = 842;
const PAGE_H = 595;
const CONTENT_W = PAGE_W - PAGE_PADDING * 2;
const HEADER_H = 60;
const FOOTER_H = 28;
const GRID_AVAILABLE_H = PAGE_H - PAGE_PADDING * 2 - HEADER_H - FOOTER_H;
const SLOT_W = (CONTENT_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const SLOT_H = (GRID_AVAILABLE_H - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function MoodboardDocument({ data }: { data: MoodboardData }) {
  const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  const pages = data.images.length === 0
    ? [[]]
    : chunk(data.images, IMAGES_PER_PAGE);
  const isEmpty = data.images.length === 0;

  return (
    <Document title={`Moodboard — ${data.shootingTitle}`} author={data.studioName}>
      {pages.map((batch, pageIdx) => (
        <Page key={pageIdx} size="A4" orientation="landscape" style={s.page}>
          <View style={s.header}>
            <View>
              <Text style={s.eyebrow}>Moodboard</Text>
              <Text style={s.title}>{data.shootingTitle}</Text>
              <Text style={s.subtitle}>für {data.customerName}</Text>
            </View>
            <View>
              <Text style={s.meta}>{data.studioName}</Text>
              <Text style={s.meta}>{today}</Text>
              {pages.length > 1 && (
                <Text style={s.meta}>Seite {pageIdx + 1} / {pages.length}</Text>
              )}
            </View>
          </View>

          {isEmpty ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>Noch keine Inspirationsbilder</Text>
              <Text style={s.emptyHint}>
                Lade Bilder im Shooting-Detail unter „Dateien" hoch, dann erscheint das Moodboard hier.
              </Text>
            </View>
          ) : (
            <View style={s.grid}>
              {batch.map((img, i) => {
                const col = i % GRID_COLS;
                const row = Math.floor(i / GRID_COLS);
                return (
                  <View
                    key={`${pageIdx}-${i}`}
                    style={[
                      s.cell,
                      {
                        width: SLOT_W,
                        height: SLOT_H,
                        marginLeft: col === 0 ? 0 : GRID_GAP,
                        marginTop: row === 0 ? 0 : GRID_GAP,
                      },
                    ]}
                  >
                    <Image src={img.url} style={s.image} />
                  </View>
                );
              })}
            </View>
          )}

          <View style={s.footer}>
            <Text>{data.studioName}</Text>
            <Text>{data.shootingTitle}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}

/**
 * Rendert das Moodboard als Stream — wird vom API-Route direkt an die Response geleitet.
 */
export async function renderMoodboardPdf(data: MoodboardData): Promise<NodeJS.ReadableStream> {
  return renderToStream(<MoodboardDocument data={data} />);
}
