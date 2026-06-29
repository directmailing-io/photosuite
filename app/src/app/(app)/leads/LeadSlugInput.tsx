"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link as LinkIcon, Copy, Save, Check } from "lucide-react";
import { setLeadSlug } from "./actions";

export function LeadSlugInput({ initial }: { initial: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = slug ? `${baseUrl}/anfrage/${slug}` : null;

  function onSave() {
    startTransition(async () => {
      try {
        await setLeadSlug(slug);
        toast.success("Anfrage-Link gespeichert");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht speichern");
      }
    });
  }

  function onCopy() {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-4 mb-6 flex items-center gap-3 flex-wrap" style={{ background: "rgb(var(--linen))" }}>
      <LinkIcon size={16} className="text-taupe shrink-0" />
      <div className="text-xs text-smoke shrink-0">Dein Anfrage-Formular:</div>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <span className="text-xs text-smoke truncate">{baseUrl}/anfrage/</span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="dein-studio"
          maxLength={40}
          className="input h-8 text-sm w-40"
        />
      </div>
      {initial && initial === slug && fullUrl && (
        <button onClick={onCopy} className="btn-ghost text-xs h-8" type="button">
          {copied ? <><Check size={12} /> Kopiert</> : <><Copy size={12} /> Link kopieren</>}
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={pending || slug.length < 3 || slug === initial}
        className="btn-primary text-xs h-8"
      >
        <Save size={12} /> {pending ? "…" : "Speichern"}
      </button>
    </div>
  );
}
