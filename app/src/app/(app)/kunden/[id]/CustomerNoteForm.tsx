"use client";

import { useRef, useState } from "react";
import { addCustomerNote } from "../actions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function CustomerNoteForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await addCustomerNote(customerId, fd);
      formRef.current?.reset();
      toast.success("Notiz gespeichert");
      router.refresh();
    } catch {
      toast.error("Konnte nicht speichern");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <textarea
        name="text"
        rows={3}
        required
        placeholder={`Kurz festhalten — z.B. „Hat angerufen, möchte Termin verschieben auf Mai."`}
        className="textarea"
      />
      <div className="flex justify-end">
        <button disabled={busy} className="btn-primary">{busy ? "Speichern…" : "Notiz speichern"}</button>
      </div>
    </form>
  );
}
