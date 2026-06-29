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
  kind: string;
  price: number;
  depositAmount: number | null;
  paymentTerms: string | null;
  durationMin: number | null;
  checklistCount: number;
};
type Customer = { id: string; firstName: string; lastName: string; avatarUrl: string | null };
type Status = { id: string; label: string; color: string };

type Props = {
  packageMode: "all_in_one" | "modular";
  packages: Pkg[];
  customers: Customer[];
  statuses: Status[];
  defaultCustomerId?: string;
  action: (formData: FormData) => Promise<void>;
};

// Im modular-Mode wählt User 2 Pakete: Anzahlung (Pflicht) + Bildpaket (optional).
// Im all_in_one-Mode wie bisher: 1 Paket oder „individual".
export type WizardSelection =
  | { mode: "all_in_one"; pkg: Pkg | "individual" }
  | { mode: "modular"; depositPkg: Pkg; imagePkg: Pkg | null };

export function ShootingWizard({ packageMode, packages, customers, statuses, defaultCustomerId, action }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selection, setSelection] = useState<WizardSelection | null>(null);

  // Pakete für die jeweilige Spalte filtern. „all_in_one"-Pakete tauchen in
  // beiden Listen auf, damit Lisa beim Mode-Wechsel keine Lücken hat.
  const depositCandidates = packages.filter((p) => p.kind === "deposit" || p.kind === "all_in_one");
  const imageCandidates = packages.filter((p) => p.kind === "image_pack" || p.kind === "all_in_one");

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 1 && packageMode === "all_in_one" && (
        <PackageStep
          packages={packages}
          selected={selection?.mode === "all_in_one" ? selection.pkg : null}
          onSelect={(p) => setSelection(p === null ? null : { mode: "all_in_one", pkg: p })}
          onContinue={() => selection && setStep(2)}
        />
      )}

      {step === 1 && packageMode === "modular" && (
        <ModularPackageStep
          depositPackages={depositCandidates}
          imagePackages={imageCandidates}
          selection={selection?.mode === "modular" ? selection : null}
          onSelect={(s) => setSelection(s)}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && selection && (
        <DetailsStep
          selection={selection}
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
          background: done ? "rgb(var(--ink))" : active ? "rgb(var(--accent))" : "rgb(var(--stone))",
          color: done || active ? "#fff" : "rgb(var(--smoke))",
        }}
      >
        {done ? <Check size={14} /> : n}
      </div>
      <span className={cn("font-medium", active ? "text-ink" : "text-smoke")}>{label}</span>
    </div>
  );
}

/* -------------------- Modular: 2-Spalten-Picker -------------------- */

function ModularPackageStep({
  depositPackages,
  imagePackages,
  selection,
  onSelect,
  onContinue,
}: {
  depositPackages: Pkg[];
  imagePackages: Pkg[];
  selection: { mode: "modular"; depositPkg: Pkg; imagePkg: Pkg | null } | null;
  onSelect: (s: { mode: "modular"; depositPkg: Pkg; imagePkg: Pkg | null }) => void;
  onContinue: () => void;
}) {
  const depositSelected = selection?.depositPkg ?? null;
  const imageSelected = selection?.imagePkg ?? null;

  function setDeposit(p: Pkg) {
    onSelect({ mode: "modular", depositPkg: p, imagePkg: imageSelected });
  }
  function setImage(p: Pkg | null) {
    if (!depositSelected) return;
    onSelect({ mode: "modular", depositPkg: depositSelected, imagePkg: p });
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="eyebrow eyebrow-muted mb-3">Schritt 1 — Anzahlungs-Paket *</div>
        <div className="text-sm text-smoke mb-4">
          Was die Kundin bei Buchung wählt — z.B. Solo, Couple, Reise.
        </div>
        {depositPackages.length === 0 ? (
          <div className="card p-6 text-center text-sm text-smoke italic">
            Noch keine Anzahlungs-Pakete. Lege eines unter „Pakete" an.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {depositPackages.map((p) => (
              <PackageTile
                key={p.id}
                pkg={p}
                active={depositSelected?.id === p.id}
                onClick={() => setDeposit(p)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="eyebrow eyebrow-muted mb-3">Schritt 2 — Bildpaket (optional)</div>
        <div className="text-sm text-smoke mb-4">
          Kann jetzt schon gewählt werden — oder später bei der Bildauswahl.
        </div>
        {imagePackages.length === 0 ? (
          <div className="card p-6 text-center text-sm text-smoke italic">
            Noch keine Bildpakete. Lege eines unter „Pakete" an oder lasse das hier später leer.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* „Später wählen" Karte */}
            <button
              type="button"
              onClick={() => setImage(null)}
              disabled={!depositSelected}
              className={cn(
                "card card-hover overflow-hidden text-left flex flex-col transition-all p-5",
                imageSelected === null && depositSelected && "ring-2",
              )}
              style={{
                borderColor: imageSelected === null && depositSelected ? "rgb(var(--accent))" : undefined,
                borderStyle: "dashed",
                opacity: depositSelected ? 1 : 0.4,
              }}
            >
              <Sparkles size={28} strokeWidth={1.2} className="text-taupe mb-2" />
              <div className="font-serif text-xl">Später wählen</div>
              <div className="text-xs text-smoke mt-1">
                Bildpaket wird bei der Bildauswahl bestimmt — nichts jetzt festlegen.
              </div>
            </button>
            {imagePackages.map((p) => (
              <PackageTile
                key={p.id}
                pkg={p}
                active={imageSelected?.id === p.id}
                disabled={!depositSelected}
                onClick={() => setImage(p)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!depositSelected}
          onClick={onContinue}
          className="btn-accent disabled:opacity-50"
        >
          Weiter <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function PackageTile({
  pkg, active, disabled, onClick,
}: {
  pkg: Pkg;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("card card-hover overflow-hidden text-left flex flex-col transition-all", active && "ring-2", disabled && "opacity-40 cursor-not-allowed")}
      style={{
        borderColor: active ? "rgb(var(--accent))" : undefined,
        boxShadow: active ? "0 0 0 3px rgba(200,16,46,0.15)" : undefined,
      }}
    >
      <div className="aspect-[16/9] bg-linen relative overflow-hidden">
        {pkg.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pkg.coverUrl} alt="" className="w-full h-full object-cover" />
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
        <div className="font-serif text-xl">{pkg.name}</div>
        {pkg.description && <div className="text-xs text-smoke mt-1 line-clamp-2">{pkg.description}</div>}
        <div className="hairline mt-3 pt-3 flex items-center justify-between text-xs">
          <div className="font-serif text-base tabular-nums">{formatEUR(pkg.price)}</div>
          <div className="flex items-center gap-2 text-smoke">
            {pkg.durationMin && <span className="flex items-center gap-1"><Clock size={11} /> {pkg.durationMin} min</span>}
            {pkg.checklistCount > 0 && <span className="flex items-center gap-1"><ListChecks size={11} /> {pkg.checklistCount}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function PackagePreviewCard({ label, pkg }: { label: string; pkg: Pkg }) {
  return (
    <div className="card p-4 flex items-center gap-3 bg-paper">
      <div className="w-14 h-14 rounded-lg bg-linen overflow-hidden shrink-0">
        {pkg.coverUrl
          ? <img src={pkg.coverUrl} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-taupe"><PackageIcon size={22} strokeWidth={1} /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="eyebrow eyebrow-muted">{label}</div>
        <div className="font-serif text-lg truncate">{pkg.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-serif text-lg tabular-nums">{formatEUR(pkg.price)}</div>
      </div>
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
                borderColor: active ? "rgb(var(--accent))" : undefined,
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
                borderColor: active ? "rgb(var(--accent))" : undefined,
                boxShadow: active ? "0 0 0 3px rgba(200,16,46,0.15)" : undefined,
                borderStyle: "dashed",
              }}
            >
              <div className="aspect-[16/9] relative overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgb(var(--linen)) 0%, rgb(var(--stone)) 100%)" }}>
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
  selection,
  customers,
  statuses,
  defaultCustomerId,
  onBack,
  action,
}: {
  selection: WizardSelection;
  customers: Customer[];
  statuses: Status[];
  defaultCustomerId?: string;
  onBack: () => void;
  action: (fd: FormData) => Promise<void>;
}) {
  // Aktive Pakete je nach Mode: bei all_in_one EIN Paket (oder „individual"),
  // bei modular Anzahlungs- + optionales Bildpaket.
  const primaryPkg: Pkg | null =
    selection.mode === "all_in_one"
      ? selection.pkg === "individual" ? null : selection.pkg
      : selection.depositPkg;
  const imagePkg: Pkg | null = selection.mode === "modular" ? selection.imagePkg : null;

  // Aggregat-Preis für „all_in_one": pkg.price.
  // Für „modular": deposit.price + image.price (wenn beide vorhanden).
  const aggregatePrice = (primaryPkg?.price ?? 0) + (imagePkg?.price ?? 0);
  const aggregateDeposit = selection.mode === "modular"
    ? primaryPkg?.price ?? 0  // im modular ist das Anzahlungspaket selbst die Anzahlung
    : primaryPkg?.depositAmount ?? 0;

  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [price, setPrice] = useState(aggregatePrice ? String(aggregatePrice) : "");
  const [deposit, setDeposit] = useState(aggregateDeposit ? String(aggregateDeposit) : "");
  const [terms, setTerms] = useState(primaryPkg?.paymentTerms ?? "");
  const [description, setDescription] = useState(primaryPkg?.description ?? "");
  const [title, setTitle] = useState("");

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Auto-title bei modular: zeigt beide Paket-Namen, falls vorhanden.
  const baseTitle = selection.mode === "modular"
    ? imagePkg ? `${primaryPkg!.name} + ${imagePkg.name}` : primaryPkg!.name
    : primaryPkg?.name ?? "Shooting";
  const suggested = selectedCustomer ? `${baseTitle} · ${selectedCustomer.firstName}` : "";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      if (!fd.get("title")) fd.set("title", suggested);
      if (primaryPkg) fd.set("packageId", primaryPkg.id);
      if (imagePkg) fd.set("imagePackageId", imagePkg.id);
      await action(fd);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {selection.mode === "modular" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PackagePreviewCard label="Anzahlungs-Paket" pkg={selection.depositPkg} />
          {imagePkg
            ? <PackagePreviewCard label="Bildpaket" pkg={imagePkg} />
            : (
              <div className="card p-5 flex items-center gap-3 bg-paper">
                <Sparkles size={20} className="text-taupe" />
                <div>
                  <div className="font-medium text-sm">Bildpaket: später wählen</div>
                  <div className="text-xs text-smoke">Wird bei der Bildauswahl bestimmt.</div>
                </div>
              </div>
            )}
        </div>
      ) : primaryPkg ? (
        <div className="card p-5 flex items-center gap-4 bg-paper">
          <div className="w-20 h-20 rounded-lg bg-linen overflow-hidden shrink-0">
            {primaryPkg.coverUrl
              ? <img src={primaryPkg.coverUrl} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-taupe"><PackageIcon size={28} strokeWidth={1} /></div>}
          </div>
          <div className="flex-1">
            <div className="eyebrow eyebrow-muted">Ausgewähltes Paket</div>
            <div className="font-serif text-2xl">{primaryPkg.name}</div>
            <div className="text-xs text-smoke mt-1">
              Preis, Bedingungen, Beschreibung{primaryPkg.checklistCount > 0 && ` und ${primaryPkg.checklistCount} Checklisten`} werden vorgeladen — alles unten überschreibbar.
            </div>
          </div>
          <div className="text-right">
            <div className="font-serif text-2xl tabular-nums">{formatEUR(primaryPkg.price)}</div>
          </div>
        </div>
      ) : (
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
        <Field label="Kundin auswählen" hint="Aus dem Kundenstamm — oder unten direkt neu anlegen.">
          <select
            name="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="select"
          >
            <option value="">— wählen oder neu anlegen —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </Field>
        {selectedCustomer ? (
          <div className="flex items-center gap-3 text-sm text-smoke">
            <Avatar url={selectedCustomer.avatarUrl} firstName={selectedCustomer.firstName} lastName={selectedCustomer.lastName} size={32} />
            <span>Shooting wird {selectedCustomer.firstName} {selectedCustomer.lastName} zugeordnet.</span>
          </div>
        ) : (
          <div className="pt-2 border-t border-stone/60 space-y-3">
            <div className="text-xs text-smoke">
              Oder direkt eine neue Kundin anlegen — wird im Kundenstamm gespeichert.
            </div>
            <FormRow>
              <Field label="Vorname *">
                <input name="inlineCustomerFirstName" className="input" placeholder="z.B. Anna" />
              </Field>
              <Field label="Nachname *">
                <input name="inlineCustomerLastName" className="input" placeholder="z.B. Kraus" />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="E-Mail">
                <input name="inlineCustomerEmail" type="email" className="input" placeholder="anna@beispiel.de" />
              </Field>
              <Field label="Telefon">
                <input name="inlineCustomerPhone" className="input" placeholder="+49 …" />
              </Field>
            </FormRow>
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
        <button disabled={busy} className="btn-accent">
          {busy ? "Anlegen…" : "Shooting anlegen"}
        </button>
      </div>
    </form>
  );
}
