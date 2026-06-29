"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createLeadForm } from "./actions";

export function NewFormButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createLeadForm(fd);
      } catch (err: any) {
        if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error(err?.message ?? "Konnte nicht anlegen");
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Plus size={15} /> Neues Formular
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={onSubmit}
            className="w-full max-w-md rounded-xl shadow-lg p-6 space-y-4"
            style={{ background: "rgb(var(--paper))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-serif text-xl">Neues Formular</div>
              <button type="button" onClick={() => setOpen(false)} className="btn-icon">
                <X size={14} />
              </button>
            </div>
            <label className="block text-sm">
              <span className="font-medium">Name *</span>
              <input
                name="name"
                required
                maxLength={200}
                className="input mt-1"
                placeholder='z.B. "Boudoir-Anfrage"'
                autoFocus
              />
              <span className="text-xs text-smoke block mt-1">
                Wird als Headline auf der Formular-Seite verwendet — kannst du später ändern.
              </span>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Slug (optional)</span>
              <input
                name="slug"
                maxLength={40}
                className="input mt-1 font-mono"
                placeholder="aus Name abgeleitet"
              />
              <span className="text-xs text-smoke block mt-1">
                URL-Teil — wird zu <code>/anfrage/[slug]</code>.
              </span>
            </label>
            <div className="text-xs text-smoke pt-1">
              Standard-Felder Vorname, Email, Telefon, Nachricht + DSGVO-Zustimmung werden
              gleich angelegt — kannst du danach beliebig anpassen.
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost text-sm">
                Abbrechen
              </button>
              <button type="submit" disabled={pending} className="btn-primary text-sm">
                {pending ? "Lege an…" : "Formular anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
