"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, FormRow } from "@/components/form/Field";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { updateStudioProfile } from "./actions";

type Profile = {
  studioName: string | null;
  studioTagline: string | null;
  studioPhone: string | null;
  studioEmail: string | null;
  studioWebsite: string | null;
  studioAddress: string | null;
  studioInstagram: string | null;
  showStudioPhone: boolean;
  showStudioEmail: boolean;
  showStudioWebsite: boolean;
  showStudioAddress: boolean;
  showStudioInstagram: boolean;
};

export function StudioProfile({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateStudioProfile(new FormData(e.currentTarget));
      toast.success("Profil gespeichert");
      router.refresh();
    } catch {
      toast.error("Konnte nicht speichern");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      <div>
        <div className="font-serif text-xl">Studio-Profil</div>
        <div className="text-xs text-smoke mt-1">
          Diese Angaben erscheinen auf der Kundenansicht jedes Shootings.
        </div>
      </div>

      <FormRow>
        <Field label="Studio-Name"><input name="studioName" defaultValue={initial.studioName ?? ""} className="input" /></Field>
        <Field label="Tagline" hint="Kurzer Satz unter dem Namen"><input name="studioTagline" defaultValue={initial.studioTagline ?? ""} className="input" /></Field>
      </FormRow>
      <FormRow>
        <Field
          label="E-Mail"
          hint={
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="showStudioEmail" defaultChecked={initial.showStudioEmail} className="w-3 h-3" />
              <span>Auf Kundenseite anzeigen</span>
            </label>
          }
        >
          <input type="email" name="studioEmail" defaultValue={initial.studioEmail ?? ""} className="input" />
        </Field>
        <Field
          label="Telefon"
          hint={
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="showStudioPhone" defaultChecked={initial.showStudioPhone} className="w-3 h-3" />
              <span>Auf Kundenseite anzeigen</span>
            </label>
          }
        >
          <input name="studioPhone" defaultValue={initial.studioPhone ?? ""} className="input" />
        </Field>
      </FormRow>
      <FormRow>
        <Field
          label="Website"
          hint={
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="showStudioWebsite" defaultChecked={initial.showStudioWebsite} className="w-3 h-3" />
              <span>Auf Kundenseite anzeigen</span>
            </label>
          }
        >
          <input name="studioWebsite" defaultValue={initial.studioWebsite ?? ""} placeholder="https://…" className="input" />
        </Field>
        <Field
          label="Instagram"
          hint={
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="showStudioInstagram" defaultChecked={initial.showStudioInstagram} className="w-3 h-3" />
              <span>Auf Kundenseite anzeigen</span>
            </label>
          }
        >
          <input name="studioInstagram" defaultValue={initial.studioInstagram ?? ""} placeholder="@username" className="input" />
        </Field>
      </FormRow>
      <Field
        label="Adresse"
        hint={
          <span className="flex flex-wrap items-center gap-3">
            <span>Mehrzeilig möglich.</span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" name="showStudioAddress" defaultChecked={initial.showStudioAddress} className="w-3 h-3" />
              <span>Auf Kundenseite anzeigen</span>
            </label>
          </span>
        }
      >
        <textarea name="studioAddress" defaultValue={initial.studioAddress ?? ""} rows={3} className="textarea" placeholder="Studio-Name\nStraße\nPLZ Stadt" />
      </Field>

      <div className="flex justify-end">
        <button disabled={busy} className="btn-primary"><Save size={14} /> {busy ? "Speichern…" : "Profil speichern"}</button>
      </div>
    </form>
  );
}
