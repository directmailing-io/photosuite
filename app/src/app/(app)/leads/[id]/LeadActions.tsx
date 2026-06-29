"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Trash2, AlertTriangle, Link2 } from "lucide-react";
import { convertLeadToCustomer, deleteLead } from "../actions";

export function LeadActions({
  leadId,
  currentStatus,
  duplicateCustomerId,
  duplicateCustomerName,
  isConverted,
}: {
  leadId: string;
  currentStatus: string;
  duplicateCustomerId: string | null;
  duplicateCustomerName: string | null;
  isConverted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showDupModal, setShowDupModal] = useState(false);

  function onConvertNew() {
    startTransition(async () => {
      try {
        await convertLeadToCustomer(leadId);
        // Action macht selbst redirect — falls nicht (selten), als Fallback:
        router.refresh();
      } catch (err: any) {
        const digest = err?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        toast.error(err?.message ?? "Konvertierung fehlgeschlagen");
      }
    });
  }

  function onConvertExisting() {
    if (!duplicateCustomerId) return;
    setShowDupModal(false);
    startTransition(async () => {
      try {
        await convertLeadToCustomer(leadId, duplicateCustomerId);
        router.refresh();
      } catch (err: any) {
        const digest = err?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        toast.error(err?.message ?? "Konvertierung fehlgeschlagen");
      }
    });
  }

  function onDelete() {
    if (!confirm("Lead wirklich löschen? Das ist nicht umkehrbar.")) return;
    startTransition(async () => {
      try {
        await deleteLead(leadId);
        router.refresh();
      } catch (err: any) {
        const digest = err?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        toast.error(err?.message ?? "Konnte nicht löschen");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {!isConverted && (
          duplicateCustomerId ? (
            <button
              type="button"
              onClick={() => setShowDupModal(true)}
              disabled={pending}
              className="btn-accent text-sm"
            >
              <UserPlus size={14} /> Zu Kundin konvertieren
            </button>
          ) : (
            <button
              type="button"
              onClick={onConvertNew}
              disabled={pending}
              className="btn-accent text-sm"
            >
              <UserPlus size={14} /> Zu Kundin konvertieren
            </button>
          )
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="btn-ghost text-sm"
          style={{ color: "rgb(var(--accent))" }}
        >
          <Trash2 size={14} /> Lead löschen
        </button>
      </div>

      {/* Duplikat-Modal */}
      {showDupModal && duplicateCustomerId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowDupModal(false)}>
          <div className="card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: "rgb(var(--accent))" }} />
              <div>
                <div className="font-serif text-xl">Diese Email existiert schon</div>
                <p className="text-sm text-smoke mt-1 leading-relaxed">
                  Es gibt bereits eine Kundin „<strong>{duplicateCustomerName}</strong>" mit dieser
                  E-Mail. Möchtest du den Lead mit dieser bestehenden Kundin verknüpfen oder eine
                  neue Kundin anlegen?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onConvertExisting}
                disabled={pending}
                className="btn-accent text-sm"
              >
                <Link2 size={14} /> Mit „{duplicateCustomerName}" verknüpfen
              </button>
              <button
                type="button"
                onClick={() => { setShowDupModal(false); onConvertNew(); }}
                disabled={pending}
                className="btn-secondary text-sm"
              >
                <UserPlus size={14} /> Trotzdem neue Kundin anlegen
              </button>
              <button
                type="button"
                onClick={() => setShowDupModal(false)}
                className="btn-ghost text-sm"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
