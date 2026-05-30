"use client";

import { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function CustomerLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const full = `${window.location.origin}${url}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      toast.success("Kundenlink kopiert");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Konnte nicht kopieren");
    }
  }

  return (
    <div className="flex items-center gap-1 bg-paper border border-stone rounded-lg overflow-hidden">
      <a href={url} target="_blank" className="flex items-center gap-2 px-3 h-9 text-sm hover:bg-linen">
        <ExternalLink size={14} /> Kundenansicht
      </a>
      <button onClick={onCopy} className="px-3 h-9 hover:bg-linen border-l border-stone" title="Link kopieren">
        {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
      </button>
    </div>
  );
}
