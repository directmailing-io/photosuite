"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Calendar } from "lucide-react";

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [, startTransition] = useTransition();

  // Debounced URL-Sync für das Textfeld (300ms). Datumsfelder updaten sofort.
  useEffect(() => {
    const t = setTimeout(() => pushParams({ q }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function pushParams(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `/buchhaltung?${qs}` : "/buchhaltung", { scroll: false });
    });
  }

  function onFrom(v: string) { setFrom(v); pushParams({ from: v }); }
  function onTo(v: string) { setTo(v); pushParams({ to: v }); }

  function reset() {
    setQ(""); setFrom(""); setTo("");
    pushParams({ q: "", from: "", to: "" });
  }

  const hasActive = q || from || to;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-smoke pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche nach Nummer, Kundin oder Shooting…"
          className="input pl-9 pr-9 h-10 text-sm"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-smoke hover:text-ink"
            type="button"
            aria-label="Suche leeren"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-smoke">
        <Calendar size={13} />
        <input
          type="date"
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          className="input h-10 text-sm w-40"
          aria-label="Rechnungsdatum von"
        />
        <span>–</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onTo(e.target.value)}
          className="input h-10 text-sm w-40"
          aria-label="Rechnungsdatum bis"
        />
      </div>

      {hasActive && (
        <button type="button" onClick={reset} className="btn-ghost text-xs h-10">
          <X size={13} /> Suche zurücksetzen
        </button>
      )}
    </div>
  );
}
