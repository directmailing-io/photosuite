"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("E-Mail oder Passwort stimmen nicht.");
      return;
    }
    router.push(params.get("callbackUrl") || "/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:block flex-1 relative" style={{
        backgroundImage: "url('/assets/lisa_portrait.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}>
        <div className="absolute inset-0" style={{
          background: "linear-gradient(180deg, rgba(25,25,26,0.55) 0%, rgba(25,25,26,0.15) 50%, rgba(25,25,26,0.85) 100%)"
        }} />
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-bg">
          <div
            className="leading-none"
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: "52px",
              letterSpacing: "-0.01em",
            }}
          >
            <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.95)" }}>photo</span>
            <span style={{ fontStyle: "italic", fontWeight: 500, color: "var(--accent)" }}>suite</span>
          </div>
          <div className="font-serif text-5xl mt-3 leading-tight">Schön, dich<br/>wiederzusehen.</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <div className="mb-10">
            <div className="font-serif text-3xl text-ink">Anmelden</div>
            <div className="text-sm text-smoke mt-2">
              Willkommen zurück. Melde dich an, um weiterzumachen.
            </div>
          </div>

          <label className="label">E-Mail</label>
          <input
            type="email"
            name="email"
            className="input mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <label className="label">Passwort</label>
          <input
            type="password"
            name="password"
            className="input mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <div className="text-sm mt-3 px-3 py-2 rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
            {loading ? "Anmelden…" : "Anmelden"}
          </button>

          <div className="text-xs text-smoke mt-8 text-center">
            <span style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontStyle: "italic", fontWeight: 500 }}>photosuite</span>
            <span> · MVP lokal · Standard: </span>
            <code>lisa@local.crm</code> / <code>lisa</code>
          </div>
        </form>
      </div>
    </div>
  );
}
