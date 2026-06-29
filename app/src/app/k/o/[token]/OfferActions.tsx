"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { publicAcceptOffer, publicDeclineOffer } from "../../../(app)/angebote/actions";

export function OfferActions({ token, customerName }: { token: string; customerName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [reason, setReason] = useState("");

  function onAccept() {
    if (!confirm(`Angebot annehmen, ${customerName}?\nWir reservieren dann den Termin für dich.`)) return;
    startTransition(async () => {
      const res = await publicAcceptOffer(token);
      if (res.ok) {
        toast.success("Angenommen — wir melden uns!");
        router.refresh();
      } else {
        toast.error(res.message ?? "Konnte nicht annehmen");
      }
    });
  }

  function onSubmitDecline(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await publicDeclineOffer(token, reason);
      if (res.ok) {
        toast.success("Schade — danke für die Rückmeldung.");
        router.refresh();
      } else {
        toast.error(res.message ?? "Konnte nicht senden");
      }
    });
  }

  return (
    <section className="bg-paper rounded-xl border border-stone p-6 mb-6">
      <div className="text-sm text-center mb-4 text-smoke">Wie möchtest du auf das Angebot reagieren?</div>
      {!confirmingDecline ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={onAccept}
            disabled={pending}
            className="btn-primary justify-center py-3"
            style={{ background: "#2F6B4A" }}
          >
            <CheckCircle2 size={16} /> Angebot annehmen
          </button>
          <button
            onClick={() => setConfirmingDecline(true)}
            disabled={pending}
            className="btn-secondary justify-center py-3"
          >
            <XCircle size={16} /> Ablehnen
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmitDecline} className="space-y-3">
          <label className="block text-sm">
            <span className="text-smoke">Möchtest du uns einen kurzen Grund mitteilen? (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={3}
              className="textarea mt-1"
              placeholder='z.B. „Preis liegt über meinem Budget" oder „Termin passt nicht"'
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setConfirmingDecline(false)}
              disabled={pending}
              className="btn-ghost text-sm"
            >
              Abbrechen
            </button>
            <button type="submit" disabled={pending} className="btn-primary text-sm">
              Ablehnung senden
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
