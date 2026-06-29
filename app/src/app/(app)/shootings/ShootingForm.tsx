"use client";

import { Field, FormRow } from "@/components/form/Field";
import { TeamPicker, type TeamPickerMember } from "@/components/TeamPicker";
import { Trash2, UsersRound, Plus, Minus, Image as ImageIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { toast } from "sonner";

type Customer = { id: string; firstName: string; lastName: string };
type Pkg = {
  id: string;
  name: string;
  kind?: string;
  price: number;
  description: string | null;
  depositAmount: number | null;
  paymentTerms: string | null;
  durationMin: number | null;
  isActive: boolean;
  primaryContactId?: string | null;
  defaultTeamIds?: string[];
  availableAddonIds?: string[];
};
type Status = { id: string; label: string; color: string };
type AddonOpt = { id: string; name: string; price: number; imageUrl: string | null; description: string | null; isActive: boolean };

// Gebuchte Add-Ons mit Anzahl + Preis-Snapshot (Anzeige im Stepper)
export type BookedAddon = { addonId: string; quantity: number; unitPrice: number };

export type ShootingInitial = {
  id?: string;
  title?: string;
  customerId?: string;
  packageId?: string | null;
  imagePackageId?: string | null;
  statusId?: string | null;
  description?: string | null;
  price?: number;
  depositAmount?: number | null;
  depositPaid?: boolean;
  finalPaid?: boolean;
  paymentTerms?: string | null;
  primaryContactId?: string | null;
  teamIds?: string[];
  bookedAddons?: BookedAddon[];
  showTeamOnPublic?: boolean;
};

type Props = {
  initial?: ShootingInitial;
  customers: Customer[];
  packages: Pkg[];
  statuses: Status[];
  team: TeamPickerMember[];
  addons?: AddonOpt[];
  packageMode?: "all_in_one" | "modular";
  action: (formData: FormData) => Promise<void>;
  deleteAction?: () => Promise<void>;
};

export function ShootingForm({ initial, customers, packages, statuses, team, addons = [], packageMode = "all_in_one", action, deleteAction }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [packageId, setPackageId] = useState<string | null>(initial?.packageId ?? null);
  const [price, setPrice] = useState<string>(initial?.price?.toString() ?? "");
  const [deposit, setDeposit] = useState<string>(initial?.depositAmount?.toString() ?? "");
  const [terms, setTerms] = useState<string>(initial?.paymentTerms ?? "");
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  // Map<addonId, quantity>. Quantity 0 = nicht gebucht.
  const [bookedQty, setBookedQty] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>();
    (initial?.bookedAddons ?? []).forEach((b) => m.set(b.addonId, b.quantity));
    return m;
  });

  const activePackages = useMemo(
    () => packages.filter((p) => p.isActive || p.id === initial?.packageId),
    [packages, initial?.packageId],
  );

  // Welche Add-Ons sind für das aktuell gewählte Paket verfügbar?
  // Sichtbar: alle aktiven (gefiltert nach Paket-Whitelist, falls vorhanden) PLUS bereits gebuchte
  // (auch wenn inaktiv oder nicht mehr im Paket — sonst würde die Buchung „verschwinden").
  const availableAddons = useMemo(() => {
    const pkg = packageId ? packages.find((p) => p.id === packageId) : null;
    const allowed = new Set(pkg?.availableAddonIds ?? []);
    const hasWhitelist = allowed.size > 0;
    return addons.filter((a) => {
      const booked = (bookedQty.get(a.id) ?? 0) > 0;
      if (booked) return true;
      if (!a.isActive) return false;
      if (!hasWhitelist) return true;
      return allowed.has(a.id);
    });
  }, [packageId, packages, addons, bookedQty]);

  function setAddonQty(id: string, q: number) {
    setBookedQty((prev) => {
      const next = new Map(prev);
      if (q <= 0) next.delete(id);
      else next.set(id, Math.min(q, 99));
      return next;
    });
  }

  function applyPackageDefaults(pid: string) {
    setPackageId(pid);
    const pkg = packages.find((p) => p.id === pid);
    if (!pkg || initial?.id) return;
    setPrice(String(pkg.price));
    setDeposit(pkg.depositAmount ? String(pkg.depositAmount) : "");
    setTerms(pkg.paymentTerms ?? "");
    if (!description) setDescription(pkg.description ?? "");
  }

  // Summe gebuchter Add-Ons
  const addonSum = useMemo(() => {
    let sum = 0;
    bookedQty.forEach((qty, id) => {
      const a = addons.find((x) => x.id === id);
      if (a) sum += a.price * qty;
    });
    return sum;
  }, [bookedQty, addons]);

  const pkgPriceNum = Number(price) || 0;
  const totalPrice = pkgPriceNum + addonSum;
  const bookedCount = Array.from(bookedQty.values()).reduce((a, b) => a + b, 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      // Format: addons[<id>] = quantity  → Server splittet
      bookedQty.forEach((qty, id) => {
        fd.append("addons", `${id}:${qty}`);
      });
      await action(fd);
      toast.success(initial?.id ? "Gespeichert" : "Shooting angelegt");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!deleteAction) return;
    if (!confirm("Shooting wirklich löschen?")) return;
    setBusy(true);
    try { await deleteAction(); } catch { toast.error("Konnte nicht löschen"); setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Titel, Kundin, Status werden inline im Header oben bearbeitet
          (ShootingHeaderInlineEdit). Hidden-Inputs spiegeln die Werte,
          damit das große Update-Form sie nicht versehentlich auf leer setzt. */}
      {initial?.id && (
        <>
          <input type="hidden" name="title" value={initial.title} />
          <input type="hidden" name="customerId" value={initial.customerId ?? ""} />
          <input type="hidden" name="statusId" value={initial.statusId ?? ""} />
        </>
      )}

      <section className="card p-6 space-y-4">
        <div className="eyebrow eyebrow-muted">Paket & Preis</div>
        <Field
          label={packageMode === "modular" ? "Anzahlungs-Paket" : "Paket"}
          hint="Wählst du ein Paket, übernehmen wir Preis, Anzahlung, Bedingungen und Checklisten — du kannst alles überschreiben."
        >
          <select
            name="packageId"
            value={packageId ?? ""}
            onChange={(e) => applyPackageDefaults(e.target.value)}
            className="select"
          >
            <option value="">— ohne Paket (individuell) —</option>
            {activePackages
              .filter((p) => packageMode !== "modular" || (p as any).kind !== "image_pack")
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(p.price)}</option>
              ))}
          </select>
        </Field>

        {/* Bildpaket-Auswahl nur im modular-Modus. Kann jetzt oder später gesetzt werden. */}
        {packageMode === "modular" && (
          <Field label="Bildpaket" hint="Wird bei der Bildauswahl gewählt — du kannst es auch jetzt schon festlegen.">
            <select
              name="imagePackageId"
              defaultValue={initial?.imagePackageId ?? ""}
              className="select"
            >
              <option value="">— später wählen —</option>
              {activePackages
                .filter((p) => (p as any).kind === "image_pack" || (p as any).kind === "all_in_one")
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(p.price)}</option>
                ))}
            </select>
          </Field>
        )}
        <FormRow>
          <Field label="Preis (€) *"><input name="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input" required /></Field>
          <Field label="Anzahlung (€)"><input name="depositAmount" type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input" /></Field>
        </FormRow>
        <Field label="Zahlungsbedingungen"><textarea name="paymentTerms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className="textarea" /></Field>
        {initial?.id && (
          <FormRow>
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="depositPaid" defaultChecked={initial.depositPaid} className="w-4 h-4" />
                <span>Anzahlung erhalten</span>
              </label>
            </Field>
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="finalPaid" defaultChecked={initial.finalPaid} className="w-4 h-4" />
                <span>Restbetrag erhalten</span>
              </label>
            </Field>
          </FormRow>
        )}
      </section>

      {availableAddons.length > 0 && (
        <section className="card p-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow eyebrow-muted">Zusatzprodukte</div>
            {bookedCount > 0 && (
              <div className="text-xs text-smoke">
                {bookedCount} {bookedCount === 1 ? "Position" : "Positionen"} gewählt
              </div>
            )}
          </div>
          <div className="text-xs text-smoke">
            Erscheinen in der Rechnung als eigene Positionen zusätzlich zum Paket-Preis.
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableAddons.map((a) => {
              const qty = bookedQty.get(a.id) ?? 0;
              const isActive = qty > 0;
              const subtotal = a.price * qty;
              return (
                <li key={a.id}>
                  <div
                    className="rounded-lg border overflow-hidden transition"
                    style={{
                      borderColor: isActive ? "rgb(var(--ink))" : "rgb(var(--stone))",
                      background: isActive ? "rgb(var(--linen))" : "rgb(var(--paper))",
                    }}
                  >
                    <div className="flex items-stretch gap-3 p-3">
                      {a.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.imageUrl} alt={a.name} className="w-14 h-14 rounded object-cover shrink-0 border border-stone" />
                      ) : (
                        <div className="w-14 h-14 rounded bg-linen shrink-0 flex items-center justify-center">
                          <ImageIcon size={20} className="text-smoke opacity-40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.name}</div>
                        {a.description && (
                          <div className="text-xs text-smoke line-clamp-1 mt-0.5">{a.description}</div>
                        )}
                        <div className="text-xs text-smoke tabular-nums mt-0.5">
                          {a.price.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                          <span className="opacity-50"> / Stück</span>
                        </div>
                      </div>
                    </div>
                    {isActive ? (
                      <div
                        className="flex items-center justify-between px-3 py-2 border-t"
                        style={{ borderColor: "rgb(var(--stone))", background: "rgb(var(--paper))" }}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setAddonQty(a.id, qty - 1)}
                            className="w-8 h-8 rounded-md border border-stone flex items-center justify-center hover:bg-linen transition"
                            aria-label="Weniger"
                          >
                            <Minus size={14} />
                          </button>
                          <div className="w-8 text-center text-sm font-medium tabular-nums">{qty}</div>
                          <button
                            type="button"
                            onClick={() => setAddonQty(a.id, qty + 1)}
                            className="w-8 h-8 rounded-md border border-stone flex items-center justify-center hover:bg-linen transition"
                            aria-label="Mehr"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className="text-sm font-medium tabular-nums">
                          = {subtotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddonQty(a.id, 1)}
                        className="w-full px-3 py-2 border-t text-xs font-medium hover:bg-linen transition flex items-center justify-center gap-1.5"
                        style={{ borderColor: "rgb(var(--stone))", color: "rgb(var(--smoke))" }}
                      >
                        <Plus size={13} /> Hinzufügen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {addonSum > 0 && (
            <div className="pt-3 border-t border-stone/60 space-y-1 text-sm tabular-nums">
              <div className="flex justify-between text-smoke">
                <span>Paket-Preis</span>
                <span>{pkgPriceNum.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
              </div>
              <div className="flex justify-between text-smoke">
                <span>Zusatzprodukte ({bookedCount})</span>
                <span>+ {addonSum.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
              </div>
              <div className="flex justify-between font-medium pt-1 border-t border-stone/40">
                <span>Gesamt für Rechnung</span>
                <span>{totalPrice.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4 flex items-center gap-2"><UsersRound size={13} /> Team beim Shooting</div>
        <div className="text-xs text-smoke mb-4">
          Wer ist dabei? Markiere eine:n Ansprechpartner:in für die Kundin (Stern). Vorbelegt aus dem Paket — überschreibbar.
        </div>
        <TeamPicker
          members={team}
          initialPrimaryId={initial?.primaryContactId}
          initialMemberIds={initial?.teamIds}
        />
        <label className="flex items-start gap-2 mt-4 pt-4 border-t border-stone/60 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="showTeamOnPublic"
            defaultChecked={initial?.showTeamOnPublic ?? true}
            className="mt-0.5 w-4 h-4"
          />
          <div>
            <div className="font-medium">Team auf der Kundenansicht zeigen</div>
            <div className="text-xs text-smoke mt-0.5">
              Wenn deaktiviert, sieht die Kundin keinen Team-Block auf ihrem Dashboard.
            </div>
          </div>
        </label>
      </section>

      <section className="card p-6">
        <div className="eyebrow eyebrow-muted mb-4">Beschreibung für die Kundin</div>
        <Field hint="Erscheint auf der Kundenansicht. Falls leer, wird die Paket-Beschreibung verwendet.">
          <textarea name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="textarea" />
        </Field>
      </section>

      <div className="flex justify-between items-center">
        <div>
          {deleteAction && (
            <button type="button" onClick={onDelete} className="btn-ghost" style={{ color: "rgb(var(--accent))" }}>
              <Trash2 size={16} /> Löschen
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.back()} className="btn-secondary">Abbrechen</button>
          <button disabled={busy} className="btn-accent">{busy ? "Speichern…" : initial?.id ? "Speichern" : "Anlegen"}</button>
        </div>
      </div>
    </form>
  );
}
