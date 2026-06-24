"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { markInvoicePaid, markInvoiceSent } from "./actions";

export function InvoiceQuickActions({
  invoiceId,
  status,
  sentAt,
  kind,
}: {
  invoiceId: string;
  status: string;
  sentAt: string | null;
  kind: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Nur für ISSUED-Rechnungen sichtbar
  if (status !== "ISSUED" || kind === "CANCEL") return null;

  async function onMarkPaid(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Diese Rechnung als bezahlt markieren?")) return;
    setBusy(true);
    try {
      await markInvoicePaid(invoiceId);
      toast.success("Als bezahlt markiert");
      router.refresh();
    } catch {
      toast.error("Konnte nicht markieren");
    } finally { setBusy(false); }
  }

  async function onMarkSent(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      await markInvoiceSent(invoiceId);
      toast.success("Als versendet markiert");
      router.refresh();
    } catch {
      toast.error("Fehler");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
      {!sentAt && (
        <button
          onClick={onMarkSent}
          disabled={busy}
          title="Als versendet markieren"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition border border-stone bg-paper hover:bg-linen"
        >
          <Send size={14} className="text-smoke" />
        </button>
      )}
      <button
        onClick={onMarkPaid}
        disabled={busy}
        title="Als bezahlt markieren"
        className="w-8 h-8 rounded-lg flex items-center justify-center transition text-white"
        style={{ background: "rgb(var(--ink))" }}
      >
        <CheckCircle2 size={14} />
      </button>
    </div>
  );
}
