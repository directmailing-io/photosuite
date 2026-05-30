"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createTemplate } from "./actions";

export function NewTemplateButton() {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    const fd = new FormData();
    fd.set("title", "Neue Vorlage");
    try {
      await createTemplate(fd);
    } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error("Konnte nicht anlegen");
      setBusy(false);
    }
  }
  return (
    <button onClick={onClick} disabled={busy} className="btn-accent">
      <Plus size={16} /> {busy ? "…" : "Neue Vorlage"}
    </button>
  );
}
