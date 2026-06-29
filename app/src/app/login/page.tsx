import { LoginForm } from "./LoginForm";

// Bilder-Pool für die Login-Page. Pro Request wird zufällig eins ausgewählt.
// `mirror: true` spiegelt das Bild horizontal — sinnvoll, wenn das Motiv
// vom Form wegschaut und durchs Spiegeln zur Anmeldung „blickt".
const LOGIN_IMAGES: ReadonlyArray<{ src: string; mirror: boolean }> = [
  { src: "/assets/login/portrait-1.jpg", mirror: true },
  { src: "/assets/login/portrait-2.jpg", mirror: false },
  { src: "/assets/login/portrait-3.jpg", mirror: true },
];

// force-dynamic stellt sicher, dass Math.random pro Request neu evaluiert wird.
// Sonst würde Next.js die Page cachen und immer dasselbe Bild zeigen.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const pick = LOGIN_IMAGES[Math.floor(Math.random() * LOGIN_IMAGES.length)];

  return (
    <div className="min-h-screen flex">
      {/* Linke Seite: großes Portrait mit Logo top-left + Tagline bottom */}
      <div className="hidden md:block flex-1 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url('${pick.src}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transform: pick.mirror ? "scaleX(-1)" : undefined,
          }}
        />
        {/* Dunkles Gradient-Overlay für Lesbarkeit von Logo & Tagline.
            Wichtig: NICHT mit gespiegelt, deshalb eigene Schicht. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(15,15,16,0.55) 0%, rgba(15,15,16,0.15) 35%, rgba(15,15,16,0.85) 100%)",
          }}
        />

        {/* Logo top-left */}
        <div
          className="absolute top-8 left-10 leading-none select-none"
          style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: "32px", letterSpacing: "-0.01em" }}
        >
          <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.95)" }}>photo</span>
          <span style={{ fontStyle: "italic", fontWeight: 500, color: "rgb(var(--accent))" }}>suite</span>
        </div>

        {/* Tagline bottom-left */}
        <div className="absolute bottom-12 left-10 right-10 text-bg">
          <div className="font-serif text-5xl leading-tight" style={{ color: "rgba(255,255,255,0.95)" }}>
            Schön, dich<br />wiederzusehen.
          </div>
        </div>
      </div>

      {/* Rechte Seite: Formular */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <LoginForm />
      </div>
    </div>
  );
}
