"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createDraftInvoice } from "../buchhaltung/actions";

type CustomerOption = { id: string; name: string; email: string | null };

/**
 * „Neue Rechnung" auf der Finanzen-Page. Statt einer eigenen Wizard-Route
 * öffnet sich ein Kunden-Picker — gleicher Flow wie „Neues Angebot" und
 * konsistent mit createDraftInvoice, das die Rechnung anlegt und auf den
 * Editor unter /buchhaltung/[id] redirected.
 */
export function NewInvoiceButton({ customers }: { customers: CustomerOption[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
    : customers.slice(0, 20);

  function onCreate(customerId: string) {
    startTransition(async () => {
      try {
        await createDraftInvoice({ customerId, preset: "blank" });
      } catch (err: any) {
        if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
        toast.error(err?.message ?? "Konnte nicht anlegen");
      }
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-accent">
        <Plus size={15} /> Neue Rechnung
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl shadow-lg p-6 max-h-[80vh] flex flex-col"
            style={{ background: "rgb(var(--paper))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-serif text-xl">Neue Rechnung</div>
                <div className="text-xs text-smoke mt-1">Für welche Kundin?</div>
              </div>
              <button onClick={() => setOpen(false)} className="btn-icon" aria-label="Schließen">
                <X size={14} />
              </button>
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name oder E-Mail suchen…"
              className="input mb-3"
            />
            {customers.length === 0 ? (
              <div className="text-xs text-smoke text-center py-6">
                Noch keine Kundinnen angelegt. Lege erst eine Kundin an, dann kannst du eine Rechnung schreiben.
              </div>
            ) : (
              <ul className="overflow-y-auto flex-1 divide-y divide-stone/60">
                {filtered.length === 0 && (
                  <li className="text-xs text-smoke text-center py-6">Keine Treffer.</li>
                )}
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onCreate(c.id)}
                      disabled={pending}
                      className="w-full text-left py-2.5 px-2 hover:bg-linen rounded transition"
                    >
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.email && <div className="text-xs text-smoke">{c.email}</div>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-[11px] text-smoke pt-3 mt-3 border-t border-stone/60">
              Tipp: Aus dem Shooting-Detail kannst du Rechnungen direkt mit Paket-/Add-On-Positionen vorbefüllen.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
