"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Upload, User as UserIcon } from "lucide-react";
import { Field, FormRow } from "@/components/form/Field";
import { updateCustomerProfilePublic } from "./actions";

export type ProfileInitial = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthday: string;            // YYYY-MM-DD
  avatarUrl: string | null;
  billingStreet: string | null;
  billingZip: string | null;
  billingCity: string | null;
  billingCountry: string | null;
  welcomeStreet: string | null;
  welcomeZip: string | null;
  welcomeCity: string | null;
  welcomeCountry: string | null;
  welcomeNote: string | null;
  deliveryStreet: string | null;
  deliveryZip: string | null;
  deliveryCity: string | null;
  deliveryCountry: string | null;
  deliveryNote: string | null;
};

export function ProfileEditForm({
  slug,
  initial,
}: {
  slug: string;
  initial: ProfileInitial;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/k/${slug}/avatar`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: null }));
        throw new Error(err.error ?? `Upload fehlgeschlagen (${res.status})`);
      }
      const data = await res.json();
      setAvatarUrl(data.url);
      toast.success("Profilbild gespeichert");
      router.refresh();
    } catch (err: any) {
      toast.error("Upload fehlgeschlagen", { description: err?.message ?? "" });
    } finally {
      setAvatarUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateCustomerProfilePublic(slug, fd);
        toast.success("Profil gespeichert", {
          description: "Lisa wird über deine Änderungen informiert.",
        });
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht speichern");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Profilbild */}
      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4">Profilbild</div>
        <div className="flex items-center gap-5">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-linen border border-stone flex items-center justify-center shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profilbild" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={36} className="text-taupe" strokeWidth={1.2} />
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={onPickAvatar}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="btn-secondary text-xs h-9"
            >
              <Upload size={13} /> {avatarUploading ? "Lädt…" : avatarUrl ? "Bild ändern" : "Bild hochladen"}
            </button>
            <div className="text-xs text-smoke mt-2">JPG, PNG, WEBP oder SVG, max. 5 MB.</div>
          </div>
        </div>
      </section>

      {/* Stammdaten */}
      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Über dich</div>
        <FormRow>
          <Field label="Vorname"><input name="firstName" defaultValue={initial.firstName} className="input" /></Field>
          <Field label="Nachname"><input name="lastName" defaultValue={initial.lastName} className="input" /></Field>
        </FormRow>
        <FormRow>
          <Field label="E-Mail"><input type="email" name="email" defaultValue={initial.email ?? ""} className="input" /></Field>
          <Field label="Telefon"><input name="phone" defaultValue={initial.phone ?? ""} className="input" /></Field>
        </FormRow>
        <Field label="Geburtstag" hint="Damit wir dich überraschen können — kein Pflichtfeld.">
          <input type="date" name="birthday" defaultValue={initial.birthday} className="input" />
        </Field>
      </section>

      {/* Rechnungsadresse */}
      <section className="card p-6 space-y-3">
        <div className="eyebrow eyebrow-muted">Rechnungsadresse</div>
        <Field label="Straße & Hausnummer">
          <input name="billingStreet" defaultValue={initial.billingStreet ?? ""} className="input" />
        </Field>
        <FormRow>
          <Field label="PLZ"><input name="billingZip" defaultValue={initial.billingZip ?? ""} className="input" /></Field>
          <Field label="Stadt"><input name="billingCity" defaultValue={initial.billingCity ?? ""} className="input" /></Field>
        </FormRow>
        <Field label="Land">
          <input name="billingCountry" defaultValue={initial.billingCountry ?? "Deutschland"} className="input" />
        </Field>
      </section>

      {/* Welcome-Package-Adresse */}
      <DeliverySection
        label="Welcome-Package"
        hint="Falls Lisa dir eine Überraschung schickt — hierhin geht's. Lass leer, wenn die Rechnungsadresse passt."
        namePrefix="welcome"
        notePlaceholder='z.B. „bitte klingeln bei Müller / Code 4231"…'
        initial={{
          street: initial.welcomeStreet,
          zip: initial.welcomeZip,
          city: initial.welcomeCity,
          country: initial.welcomeCountry,
          note: initial.welcomeNote,
        }}
      />

      {/* Foto-Lieferadresse */}
      <DeliverySection
        label="Lieferadresse für Fotoprodukte"
        hint="Wohin sollen Alben, Leinwände & Drucke? Packstation oder Wunschadresse hier hinterlegen."
        namePrefix="delivery"
        notePlaceholder='z.B. „Packstation 174, Kundennummer 12345"…'
        initial={{
          street: initial.deliveryStreet,
          zip: initial.deliveryZip,
          city: initial.deliveryCity,
          country: initial.deliveryCountry,
          note: initial.deliveryNote,
        }}
      />

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={pending} className="btn-accent">
          <Save size={14} /> {pending ? "Speichert…" : "Profil speichern"}
        </button>
      </div>
    </form>
  );
}

function DeliverySection({
  label,
  hint,
  namePrefix,
  initial,
  notePlaceholder,
}: {
  label: string;
  hint: string;
  namePrefix: "welcome" | "delivery";
  initial: {
    street: string | null;
    zip: string | null;
    city: string | null;
    country: string | null;
    note: string | null;
  };
  notePlaceholder: string;
}) {
  const hasInitial = !!(initial.street || initial.zip || initial.city || initial.country || initial.note);
  const [active, setActive] = useState<boolean>(hasInitial);
  const [street, setStreet] = useState(initial.street ?? "");
  const [zip, setZip] = useState(initial.zip ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [note, setNote] = useState(initial.note ?? "");

  const emit = (v: string) => (active ? v : "");

  return (
    <section className="card p-6 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow eyebrow-muted">{label}</div>
          <div className="text-xs text-smoke mt-1 max-w-xl">{hint}</div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          <span>Eigene Adresse</span>
        </label>
      </div>

      {active && (
        <>
          <Field label="Straße & Hausnummer">
            <input value={street} onChange={(e) => setStreet(e.target.value)} className="input" />
          </Field>
          <FormRow>
            <Field label="PLZ"><input value={zip} onChange={(e) => setZip(e.target.value)} className="input" /></Field>
            <Field label="Stadt"><input value={city} onChange={(e) => setCity(e.target.value)} className="input" /></Field>
          </FormRow>
          <Field label="Land">
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Deutschland" className="input" />
          </Field>
          <Field label="Notiz">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} className="input" />
          </Field>
        </>
      )}

      <input type="hidden" name={`${namePrefix}Street`} value={emit(street)} />
      <input type="hidden" name={`${namePrefix}Zip`} value={emit(zip)} />
      <input type="hidden" name={`${namePrefix}City`} value={emit(city)} />
      <input type="hidden" name={`${namePrefix}Country`} value={emit(country)} />
      <input type="hidden" name={`${namePrefix}Note`} value={emit(note)} />
    </section>
  );
}
