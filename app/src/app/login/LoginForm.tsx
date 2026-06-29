"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginFormInner() {
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
    <form onSubmit={onSubmit} className="w-full max-w-sm">
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink leading-tight">Willkommen zurück!</h1>
        <div className="text-sm text-smoke mt-2">Melde dich hier an:</div>
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
        <div
          className="text-sm mt-3 px-3 py-2 rounded-lg"
          style={{ background: "rgb(var(--accent-soft))", color: "rgb(var(--accent-deep))" }}
        >
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
        {loading ? "Anmelden…" : "Anmelden"}
      </button>

      <div className="mt-10 flex items-center justify-center">
        <Wordmark size={20} />
      </div>
    </form>
  );
}

function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <div
      className="leading-none select-none"
      style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: size, letterSpacing: "-0.01em" }}
    >
      <span style={{ fontWeight: 500, color: "rgb(var(--ink))" }}>photo</span>
      <span style={{ fontStyle: "italic", fontWeight: 500, color: "rgb(var(--accent))" }}>suite</span>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm text-sm text-smoke">Lädt…</div>}>
      <LoginFormInner />
    </Suspense>
  );
}
