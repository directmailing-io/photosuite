import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintTrigger } from "./PrintTrigger";

export const dynamic = "force-dynamic";

/**
 * Dedizierte Print-Seite für die Kunden-Checkliste.
 * Bewusst eigenes Layout (KEIN App-Chrome, KEIN Hero) — schlanke A4-Variante
 * mit Studio-Branding oben. Wird über Auto-`window.print()` beim Aufruf direkt
 * in den Druckdialog gereicht.
 */
export default async function PrintChecklistePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shooting = await prisma.shooting.findFirst({
    where: { publicSlug: slug },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      checklists: {
        where: { audience: "CUSTOMER" },
        orderBy: { position: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!shooting) return notFound();

  const studio = await prisma.user.findUnique({
    where: { id: shooting.ownerId },
    select: { studioName: true, name: true, logoUrl: true, studioPhone: true, studioEmail: true, studioWebsite: true },
  });
  const studioName = studio?.studioName ?? studio?.name ?? "Studio";

  const dateLabel = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  const fullVisibleChecklists = shooting.checklists.filter((c) => c.items.length > 0);

  return (
    <main style={pageStyle}>
      <PrintTrigger />

      {/* Header mit Branding */}
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {studio?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.logoUrl} alt={studioName} style={{ height: 48, width: "auto", objectFit: "contain" }} />
          ) : (
            <div style={{ fontFamily: "Georgia, serif", fontSize: 24, fontWeight: 700, color: "#19191A", fontStyle: "italic" }}>
              {studioName}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#6F6862", lineHeight: 1.5 }}>
          {studio?.studioEmail && <div>{studio.studioEmail}</div>}
          {studio?.studioPhone && <div>{studio.studioPhone}</div>}
          {studio?.studioWebsite && <div>{studio.studioWebsite}</div>}
        </div>
      </header>

      <div style={dividerStyle} />

      {/* Subject */}
      <section style={{ marginBottom: 32 }}>
        <div style={eyebrowStyle}>Checkliste für dein Shooting</div>
        <h1 style={titleStyle}>{shooting.title}</h1>
        <div style={metaStyle}>
          Für {shooting.customer.firstName} {shooting.customer.lastName ?? ""} · Stand {dateLabel}
        </div>
      </section>

      {/* Checklisten */}
      {fullVisibleChecklists.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "#6F6862", fontStyle: "italic" }}>
          Keine Checkliste hinterlegt.
        </div>
      ) : (
        fullVisibleChecklists.map((cl) => (
          <section key={cl.id} style={checklistSectionStyle}>
            <h2 style={checklistTitleStyle}>{cl.title}</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {cl.items.map((it) => (
                <li key={it.id} style={itemStyle}>
                  <span style={checkBoxStyle(it.done)}>
                    {it.done ? "✓" : ""}
                  </span>
                  <span style={{
                    flex: 1,
                    color: it.done ? "#8A847E" : "#19191A",
                    textDecoration: it.done ? "line-through" : "none",
                  }}>
                    {it.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Footer */}
      <footer style={footerStyle}>
        <div>
          Erstellt von <strong style={{ color: "#19191A" }}>{studioName}</strong>
        </div>
        <div style={{ fontSize: 9, color: "#A09890", marginTop: 4 }}>
          photosuite · Profi-CRM für Fotograf:innen
        </div>
      </footer>
    </main>
  );
}

// ---------- Inline Styles (gewollt — diese Seite ist eine reine Print-Vorlage
// und soll unabhängig von App-CSS, Theme-Tokens und Tailwind reproduzierbar sein) ----------

const pageStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: "32px 36px",
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  color: "#19191A",
  background: "#FFFFFF",
  fontSize: 13,
  lineHeight: 1.5,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 24,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "#E4E2DA",
  margin: "20px 0 32px",
};

const eyebrowStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  fontSize: 10,
  color: "#C8102E",
  fontWeight: 600,
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: 28,
  margin: "0 0 6px",
  fontWeight: 500,
  letterSpacing: "-0.01em",
  color: "#19191A",
};

const metaStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6F6862",
};

const checklistSectionStyle: React.CSSProperties = {
  marginBottom: 28,
  pageBreakInside: "avoid",
};

const checklistTitleStyle: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: 18,
  fontWeight: 600,
  margin: "0 0 12px",
  paddingBottom: 8,
  borderBottom: "1px solid #E4E2DA",
  color: "#19191A",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "8px 0",
  fontSize: 13,
};

const checkBoxStyle = (done: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  marginTop: 1,
  borderRadius: 4,
  border: `1.5px solid ${done ? "#19191A" : "#C5C2BA"}`,
  background: done ? "#19191A" : "#FFFFFF",
  color: "#FFFFFF",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
});

const footerStyle: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 16,
  borderTop: "1px solid #E4E2DA",
  textAlign: "center",
  fontSize: 10,
  color: "#8A847E",
};
