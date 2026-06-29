"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createWorkflow } from "./actions";

export function NewWorkflowButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createWorkflow(fd);
      } catch (err: any) {
        if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error(err?.message ?? "Konnte nicht anlegen");
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Plus size={15} /> Neuer Workflow
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
              <div className="font-serif text-xl">Neuer Workflow</div>
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
                placeholder='z.B. "Follow-up nach Zahlung"'
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Trigger *</span>
              <select name="trigger" className="select mt-1" defaultValue="invoice_paid">
                <option value="invoice_paid">Rechnung bezahlt</option>
                <option value="offer_accepted">Angebot angenommen</option>
                <option value="lead_created">Neue Anfrage eingegangen</option>
                <option value="manual">Manuell (nicht auto-getriggert)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Beschreibung</span>
              <textarea
                name="description"
                rows={2}
                className="textarea mt-1 text-sm"
                placeholder="Wozu soll dieser Workflow gut sein?"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-ghost text-sm">
                Abbrechen
              </button>
              <button type="submit" disabled={pending} className="btn-primary text-sm">
                {pending ? "Lege an…" : "Workflow anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
