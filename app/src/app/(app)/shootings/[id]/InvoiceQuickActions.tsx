"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { eurFromCents } from "@/lib/money";
import { createDraftInvoice } from "../../buchhaltung/actions";

type InvoiceItem = {
  id: string;
  number: string | null;
  kind: string;
  status: string;
  totalCents: number;
  issueDate: string;
};

export function InvoiceQuickActions({
  customerId,
  shootingId,
  hasDeposit,
  hasSchedule,
  invoices,
}: {
  customerId: string;
  shootingId: string;
  hasDeposit: boolean;
  hasSchedule: boolean;
  invoices: InvoiceItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function quick(preset: "fullFromShooting" | "depositFromShooting") {
    setBusy(true);
    try {
      await createDraftInvoice({ customerId, shootingId, preset });
    } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error(err?.message ?? "Fehler");
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow eyebrow-muted flex items-center gap-2">
          <FileText size={13} /> Rechnungen
        </div>
      </div>

      {!hasSchedule && (
        <div className="flex flex-col gap-2 mb-4">
          <button onClick={() => quick("fullFromShooting")} disabled={busy} className="btn-primary text-xs h-9">
            <Plus size={13} /> Vollrechnung erstellen
          </button>
          {hasDeposit && (
            <button onClick={() => quick("depositFromShooting")} disabled={busy} className="btn-secondary text-xs h-9">
              <Plus size={13} /> Anzahlungsrechnung erstellen
            </button>
          )}
          <div className="text-xs text-smoke text-center mt-1">
            Für mehrere Raten: Zahlungsplan oben definieren.
          </div>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="text-sm text-smoke text-center py-3">
          Noch keine Rechnungen für dieses Shooting.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/buchhaltung/${inv.id}`}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-linen group"
              >
                <FileText size={14} className="text-taupe shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono">{inv.number ?? "Entwurf"}</div>
                  <div className="text-xs text-smoke">
                    {inv.kind === "DEPOSIT" && "Anzahlung · "}
                    {inv.kind === "FINAL" && "Rechnung · "}
                    {inv.kind === "CANCEL" && "Storno · "}
                    {inv.status === "DRAFT" && "Entwurf"}
                    {inv.status === "ISSUED" && "Versendet"}
                    {inv.status === "PAID" && "Bezahlt"}
                    {inv.status === "CANCELLED" && "Storniert"}
                  </div>
                </div>
                <div className="text-sm tabular-nums">{eurFromCents(inv.totalCents)}</div>
                <ChevronRight size={13} className="text-smoke" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
