import Link from "next/link";
import { signUp } from "./actions";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "photosuite — Account anlegen" };

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex" style={{ background: "rgb(var(--bg))" }}>
      <div
        className="hidden md:block flex-1 relative"
        style={{
          backgroundImage: "url('/assets/lisa_portrait.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(25,25,26,0.55) 0%, rgba(25,25,26,0.15) 50%, rgba(25,25,26,0.85) 100%)" }} />
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-bg">
          <div className="leading-none" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: "52px", letterSpacing: "-0.01em" }}>
            <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.95)" }}>photo</span>
            <span style={{ fontStyle: "italic", fontWeight: 500, color: "rgb(var(--accent))" }}>suite</span>
          </div>
          <div className="font-serif text-5xl mt-3 leading-tight">
            Dein CRM,<br />dein Studio.
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <div className="font-serif text-3xl text-ink">Account anlegen</div>
            <div className="text-sm text-smoke mt-2">
              Starte in deine eigene CRM-Welt — komplett von Grund auf.
            </div>
          </div>
          <SignUpForm action={signUp} />
          <div className="text-xs text-smoke mt-8 text-center">
            Schon registriert?{" "}
            <Link href="/login" className="underline hover:text-ink">Anmelden</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
