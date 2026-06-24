"use client";

import { useState, useTransition } from "react";

type Result = { ok: false; reason: string } | void;

export function SignUpForm({ action }: { action: (fd: FormData) => Promise<Result> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const r = await action(fd);
        if (r && r.ok === false) setError(r.reason);
        // bei Erfolg: Server-Action macht redirect → wir kommen hier nie an
      } catch (err: any) {
        // NEXT_REDIRECT ist „Erfolg"
        if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        setError(err?.message ?? "Fehler beim Anlegen");
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="label">Studio-Name</label>
      <input
        type="text"
        name="studioName"
        required
        autoFocus
        className="input mb-4"
        placeholder="z.B. Lisa Steiner Photography"
      />

      <label className="label">E-Mail</label>
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        className="input mb-4"
      />

      <label className="label">Passwort</label>
      <input
        type="password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        className="input mb-1"
      />
      <div className="text-[11px] text-smoke mb-4">Mindestens 8 Zeichen.</div>

      {error && (
        <div className="rounded-lg p-3 text-sm mb-4" style={{ background: "rgb(var(--accent-soft))", color: "rgb(var(--accent))" }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full mt-2">
        {pending ? "Anlegen…" : "Account anlegen"}
      </button>
    </form>
  );
}
