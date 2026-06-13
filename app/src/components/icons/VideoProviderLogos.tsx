// Video-Provider Brand-Logos für die Lisa CRM Meeting-Auswahl.
// Inline-SVGs, neu gezeichnet als einfache geometrische Formen zu Erkennungszwecken
// im Connect-Kontext (Trademark-konform, keine offizielle Endorsement-Behauptung).
// Quellen-Inspiration: jeweilige Brand Guidelines / Wikimedia Commons.

type Props = { size?: number; className?: string };

// Zoom — blaues Kamera-Glyph ("video camera" Mark).
// Brand-Farbe: Zoom Blue #2D8CFF (offizielle Brand Guidelines).
export function ZoomLogo({ size = 24, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-label="Zoom"
    >
      <rect width="24" height="24" rx="5" fill="#2D8CFF" />
      <path
        d="M4.5 9.2c0-.66.54-1.2 1.2-1.2h7.6c1.27 0 2.3 1.03 2.3 2.3v4.5c0 .66-.54 1.2-1.2 1.2H6.8c-1.27 0-2.3-1.03-2.3-2.3V9.2zm12.5 1.05 2.8-1.85c.4-.27.95.02.95.5v6.2c0 .48-.55.77-.95.5L17 13.75v-3.5z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

// Google Meet — abgerundetes Kamera-Glyph mit den vier Google-Farben.
// Farben: Google Red #EA4335, Yellow #FBBC04, Green #34A853, Blue #4285F4.
// Aufbau: weißer Kamera-Body links, farbiges Dreieck/Lens-Element rechts,
// die vier Markenfarben in unterschiedlichen Segmenten des Linsen-Auslegers.
export function GoogleMeetLogo({ size = 24, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      aria-label="Google Meet"
    >
      {/* Kamera-Body (blau, Hauptkörper links) */}
      <path d="M6 14h20v20H6a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" fill="#4285F4" />
      {/* Grüner Lens-Ausleger rechts oben */}
      <path d="M26 18l10-6v10l-10-4z" fill="#34A853" />
      {/* Gelber Lens-Ausleger rechts unten */}
      <path d="M26 30l10 6V26l-10 4z" fill="#FBBC04" />
      {/* Roter Akzent — kleines Trapez verbindet Body und Lens */}
      <path d="M26 18v12l4-2v-8z" fill="#EA4335" />
      {/* Weißer Body-Ausschnitt (Sucher) für Tiefe */}
      <path d="M6 14h20v20H6a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" fill="#FFFFFF" fillOpacity="0.0" />
      {/* Roter Sicht-Akzent (typische 4. Farbe) — kleines Rechteck rechts der Lens */}
      <rect x="36" y="22" width="4" height="4" rx="1" fill="#EA4335" />
    </svg>
  );
}

// Microsoft Teams — violettes "T" auf abgerundetem Hintergrund.
// Brand-Farbe: Teams Purple #5059C9 (Body) / #7B83EB (Akzent).
export function TeamsLogo({ size = 24, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-label="Microsoft Teams"
    >
      {/* Hintergrund-Rechteck mit Teams-Lila */}
      <rect x="2" y="4" width="16" height="16" rx="2" fill="#5059C9" />
      {/* Weißes "T" */}
      <rect x="5" y="7" width="10" height="2" fill="#FFFFFF" />
      <rect x="9" y="7" width="2" height="10" fill="#FFFFFF" />
      {/* Sekundärer Kreis-Avatar rechts (typisches Teams-Detail) */}
      <circle cx="19" cy="10" r="3.5" fill="#7B83EB" />
      <circle cx="19" cy="9" r="1.2" fill="#FFFFFF" />
      <path d="M16.5 13.2c.5-.8 1.5-1.2 2.5-1.2s2 .4 2.5 1.2v.8h-5v-.8z" fill="#FFFFFF" />
    </svg>
  );
}

// Whereby — rundes, freundliches Mark mit violett-blauem Verlauf.
// Brand-Farbe (Whereby Rebrand): tiefes Violett #3A1D5D / Akzent #FFB8D1.
// Gestaltung: abgerundetes Quadrat mit stilisiertem "w" als verbundene Bögen.
export function WherebyLogo({ size = 24, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-label="Whereby"
    >
      <rect width="24" height="24" rx="6" fill="#3A1D5D" />
      {/* Stilisiertes "w" aus zwei verbundenen Bögen */}
      <path
        d="M5 9c0-.55.45-1 1-1s1 .45 1 1l1 5 1.5-4.2c.15-.42.55-.7 1-.7s.85.28 1 .7L12 14l1.5-4.2c.15-.42.55-.7 1-.7s.85.28 1 .7L17 14l1-5c0-.55.45-1 1-1s1 .45 1 1l-1.5 7c-.12.58-.62 1-1.2 1h-.6c-.5 0-.95-.3-1.13-.77L15 12l-1.57 4.23c-.18.47-.63.77-1.13.77h-.6c-.5 0-.95-.3-1.13-.77L9 12l-1.57 4.23c-.18.47-.63.77-1.13.77h-.6c-.58 0-1.08-.42-1.2-1L5 9z"
        fill="#FFB8D1"
      />
    </svg>
  );
}

export function ProviderLogo({
  provider,
  size,
  className,
}: {
  provider: string;
  size?: number;
  className?: string;
}) {
  switch (provider) {
    case "zoom":
      return <ZoomLogo size={size} className={className} />;
    case "google_meet":
      return <GoogleMeetLogo size={size} className={className} />;
    case "teams":
      return <TeamsLogo size={size} className={className} />;
    case "whereby":
      return <WherebyLogo size={size} className={className} />;
    default:
      return null;
  }
}
