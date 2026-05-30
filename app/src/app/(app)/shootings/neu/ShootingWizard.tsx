"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package as PackageIcon, Sparkles, ChevronLeft, ChevronRight, Clock, Check, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import { Avatar } from "@/components/Avatar";
import { formatEUR, cn } from "@/lib/utils";

type Pkg = {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  depositAmount: number | null;
  paymentTerms: string | null;
  durationMin: number | null;
  checklistCount: number;
};
type Customer = { id: string; firstName: string; lastName: string; avatarUrl: string | null };
type Status = { id: string; label: string; color: string };

type Props = {
  packages: Pkg[];
  customers: Customer[];
  statuses: Status[];
  defaultCustomerId?: string;
  action: (formData: FormData) => Promise<void>;
};

export function ShootingWizard({ packages, customers, statuses, defaultCustomerId, action }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [pkg, setPkg] = useState<Pkg | "individual" | null>(null);

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 1 && (
        <PackageStep
          packages={packages}
          selected={pkg}
          onSelect={setPkg}
          onContinue={() => pkg && setStep(2)}
        />
      )}

      {step === 2 && pkg && (
        <DetailsStep
          pkg={pkg === "individual" ? null : pkg}
          customers={customers}
          statuses={statuses}
          defaultCustomerId={defaultCustomerId}
          onBack={() => setStep(1)}
          action={action}
        />
      )}
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <StepDot n={1} active={step === 1} done={step > 1} label="Paket auswählen" />
      <div className="flex-1 h-px bg-stone" />
      <StepDot n={2} active={step === 2} done={false} label="Kundin & Eckdaten" />
    </div>
  );
}
function StepDot({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
        style={{
          background: done ? "var(--ink)" : active ? "var(--accent)" : "var(--stone)",
          color: done || active ? "#fff" : "var(--smoke)",
        }}
      >
        {done ? <Check size={14} /> : n}
      </div>
      <span className={cn("font-medium", active ? "text-ink" : "text-smoke")}>{label}</span>
    </div>
  );
}

function PackageStep({
  packages,
  selected,
  onSelect,
  onContinue,
}: {
  packages: Pkg[];
  selected: Pkg | "individual" | null;
  onSelect: (p: Pkg | "individual" | null) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {packages.map((p) => {
          const active = selected !== "individual" && selected?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p)}
              className={cn("card card-hover overflow-hidden text-left flex flex-col transition-all", active && "ring-2")}
              style={{
                borderColor: active ? "var(--accent)" : undefined,
                boxShadow: active ? "0 0 0 3px rgba(200,16,46,0.15)" : undefined,
              }}
            >
              <div className="aspect-[16/9] bg-linen relative overflow-hidden">
                {p.coverUrl ? (
                  <img src={p.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-taupe">
                    <PackageIcon size={42} strokeWidth={1} />
                  </div>
                )}
                {active && (
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center shadow-md">
                    <Check size={15} />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1">
                <div className="font-serif text-xl">{p.name}</div>
                {p.description && <div className="text-xs text-smoke mt-1 line-clamp-2">{p.description}</div>}
                <div className="hairline mt-3 pt-3 flex items-center justify-between text-xs">
                  <div className="font-serif text-base tabular-nums">{formatEUR(p.price)}</div>
                  <div className="flex items-center gap-2 text-smoke">
                    {p.durationMin && <span className="flex items-center gap-1"><Clock size={11} /> {p.durationMin} min</span>}
                    {p.checklistCount > 0 && <span className="flex items-center gap-1"><ListChecks size={11} /> {p.checklistCount}</span>}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {/* Individuell-Karte */}
        {(() => {
          const active = selected === "individual";
          return (
            <button
              type="button"
              onClick={() => onSelect("individual")}
              className={cn("card card-hover overflow-hidden text-left flex flex-col transition-all", active && "ring-2")}
              style={{
                borderColor: active ? "var(--accent)" : undefined,
                boxShadow: active ? "0 0 0 3px rgba(200,16,46,0.15)" : undefined,
                borderStyle: "dashed",
              }}
            >
              <div className="aspect-[16/9] relative overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #ECEBE8 0%, #DFDEDA 100%)" }}>
                <Sparkles size={42} strokeWidth={1} className="text-taupe" />
                {active && (
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center shadow-md">
                    <Check size={15} />
                  </div>
                )}
              </div>
              <div className="p-4 flex-1">
                <div className="font-serif text-xl">Individuell</div>
                <div className="text-xs text-smoke mt-1">Frei konfigurieren — Preis, Bedingungen, alles selbst festlegen.</div>
              </div>
            </button>
          );
        })()}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!selected}
          onClick={onContinue}
          className="btn-accent disabled:opacity-50"
        >
          Weiter <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function DetailsStep({
  pkg,
  customers,
  statuses,
  defaultCustomerId,
  onBack,
  action,
}: {
  pkg: Pkg | null;
  customers: Customer[];
  statuses: Status[];
  defaultCustomerId?: string;
  onBack: () => void;
  action: (fd: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [price, setPrice] = useState(pkg ? String(pkg.price) : "");
  const [deposit, setDeposit] = useState(pkg?.depositAmount ? String(pkg.depositAmount) : "");
  const [terms, setTerms] = useState(pkg?.paymentTerms ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [title, setTitle] = useState("");

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Auto-title: "{Paket} {Vorname}"
  const suggested = pkg && selectedCustomer ? `${pkg.name} · ${selectedCustomer.firstName}` : selectedCustomer ? `Shooting ${selectedCustomer.firstName}` : "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      if (!fd.get("title")) fd.set("title", suggested);
      if (pkg) fd.set("packageId", pkg.id);
      await action(fd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {pkg && (
        <div className="card p-5 flex items-center gap-4 bg-paper">
          <div className="w-20 h-20 rounded-lg bg-linen overflow-hidden shrink-0">
            {pkg.coverUrl ? <img src={pkg.coverUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-taupe"><PackageIcon size={28} strokeWidth={1} /></div>}
          </div>
          <div className="flex-1">
            <div className="eyebrow eyebrow-muted">Ausgewähltes Paket</div>
            <div className="font-serif text-2xl">{pkg.name}</div>
            <div className="text-xs text-smoke mt-1">Preis, Bedingungen, Beschreibung{pkg.checklistCount > 0 && ` und ${pkg.checklistCount} Checklisten`} werden vorgeladen — alles unten überschreibbar.</div>
          </div>
          <div className="text-right">
            <div className="font-serif text-2xl tabular-nums">{formatEUR(pkg.price)}</div>
          </div>
        </div>
      )}
      {!pkg && (
        <div className="card p-5 flex items-center gap-3 bg-paper">
          <Sparkles size={20} className="text-taupe" />
          <div>
            <div className="font-medium text-sm">Individuelles Shooting</div>
            <div className="text-xs text-smoke">Du legst Preis, Beschreibung und Bedingungen selbst fest.</div>
          </div>
        </div>
      )}

      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Kundin</div>
        <Field label="Kundin auswählen *">
          <select
            name="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="select"
            required
          >
            <option value="">— wählen —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </Field>
        {selectedCustomer && (
          <div className="flex items-center gap-3 text-sm text-smoke">
            <Avatar url={selectedCustomer.avatarUrl} firstName={selectedCustomer.firstName} lastName={selectedCustomer.lastName} size={32} />
            <span>Shooting wird {selectedCustomer.firstName} {selectedCustomer.lastName} zugeordnet.</span>
          </div>
        )}
      </section>

      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Eckdaten</div>
        <Field label="Titel" hint={`Lass leer für: „${suggested || "automatisch"}"`}>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested} className="input" />
        </Field>
        <Field label="Status">
          <select name="statusId" className="select">
            <option value="">— automatisch (Default) —</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Preis & Zahlung</div>
        <FormRow>
          <Field label="Preis (€) *"><input name="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input" required /></Field>
          <Field label="Anzahlung (€)"><input name="depositAmount" type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input" /></Field>
        </FormRow>
        <Field label="Zahlungsbedingungen"><textarea name="paymentTerms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="textarea" /></Field>
      </section>

      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4">Beschreibung für die Kundin</div>
        <Field hint="Erscheint auf der Kundenansicht.">
          <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="textarea" />
        </Field>
      </section>

      <div className="flex justify-between items-center">
        <button type="button" onClick={onBack} className="btn-ghost">
          <ChevronLeft size={15} /> Zurück
        </button>
        <button disabled={busy || !customerId} className="btn-accent">
          {busy ? "Anlegen…" : "Shooting anlegen"}
        </button>
      </div>
    </form>
  );
}
