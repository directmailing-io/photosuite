"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

export function PayButton({ token, amountLabel }: { token: string; amountLabel: string }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/k/invoice/${token}/checkout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        alert(data.error ?? "Bezahlung gerade nicht möglich. Bitte später nochmal versuchen.");
        setBusy(false);
        return;
      }
      window.location.href = data.url as string;
    } catch {
      alert("Bezahlung gerade nicht möglich. Bitte später nochmal versuchen.");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      className="btn-primary w-full h-12 text-base"
    >
      <CreditCard size={16} />
      {busy ? "Weiterleitung…" : `${amountLabel} jetzt bezahlen`}
    </button>
  );
}
