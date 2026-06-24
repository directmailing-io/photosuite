"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Receipt, ChevronRight, CheckCircle2, AlertTriangle, CircleDashed, CircleSlash, Bell,
} from "lucide-react";
import { toast } from "sonner";
import { eurFromCents } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { markInvoicePaid, markInvoiceSent } from "@/app/(app)/buchhaltung/actions";

export type InvoiceForHistory = {
  id: string;
  number: string | null;
  kind: string;
  status: string;
  totalCents: number;
  amountDueCents: number;
  prepaidCents: number;
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  sentAt: string | null;
  reminderLevel: number;
  shootingTitle: string | null;
};

const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Anzahlung",
  INTERIM: "Teil",
  FINAL: "Rechnung",
  CANCEL: "Storno",
};

export function PaymentHistory({
  invoices,
  compact = false,
}: {
  invoices: InvoiceForHistory[];
  compact?: boolean;
}) {
  const router = useRouter();
  const now = Date.now();

  // Summen (Stornos abziehen, also CANCELLED + Storno-Vorzeichen aus DB)
  const sumPaid = invoices
    .filter((i) => i.status === "PAID" && i.kind !== "CANCEL")
    .reduce((s, i) => s + i.totalCents, 0);
  const sumOutstanding = invoices
    .filter((i) => i.status === "ISSUED")
    .reduce((s, i) => s + i.amountDueCents, 0);
  const sumOverdue = invoices
    .filter((i) => i.status === "ISSUED" && new Date(i.dueDate).getTime() < now)
    .reduce((s, i) => s + i.amountDueCents, 0);

  async function onMarkPaid(id: string) {
    if (!confirm("Diese Rechnung als bezahlt markieren?")) return;
    try {
      await markInvoicePaid(id);
      toast.success("Als bezahlt markiert");
      router.refresh();
    } catch {
      toast.error("Konnte nicht markieren");
    }
  }
  async function onMarkSent(id: string) {
    try {
      await markInvoiceSent(id);
      toast.success("Als versendet markiert");
      router.refresh();
    } catch {
      toast.error("Fehler");
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="card">
        <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
          <div className="eyebrow eyebrow-muted flex items-center gap-2">
            <Receipt size={13} /> Zahlungshistorie
          </div>
        </div>
        <div className="px-6 py-8 text-center text-sm text-smoke">
          Noch keine Rechnungen.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-stone/60 flex items-center justify-between">
        <div className="eyebrow eyebrow-muted flex items-center gap-2">
          <Receipt size={13} /> Zahlungshistorie
        </div>
        <div className="flex items-center gap-3 text-xs text-smoke">
          <span>Bezahlt: <strong className="text-ink tabular-nums">{eurFromCents(sumPaid)}</strong></span>
          {sumOutstanding > 0 && (
            <span>Offen: <strong className="text-ink tabular-nums">{eurFromCents(sumOutstanding)}</strong></span>
          )}
          {sumOverdue > 0 && (
            <span style={{ color: "rgb(var(--accent))" }}>Überfällig: <strong className="tabular-nums">{eurFromCents(sumOverdue)}</strong></span>
          )}
        </div>
      </div>

      <ul>
        {invoices.map((inv) => {
          const due = new Date(inv.dueDate);
          const isOverdue = inv.status === "ISSUED" && due.getTime() < now;
          const daysOverdue = isOverdue ? Math.floor((now - due.getTime()) / 86400_000) : 0;
          const statusMeta = getStatusMeta(inv.status, isOverdue);
          const isFinalOrInterim = inv.kind === "FINAL" || inv.kind === "INTERIM";
          const isPayable = inv.status === "ISSUED" && inv.kind !== "CANCEL";

          return (
            <li key={inv.id} className="px-6 py-4 border-t border-stone/60 first:border-0 flex items-center gap-4 group">
              <statusMeta.Icon size={16} className="shrink-0" style={{ color: statusMeta.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/buchhaltung/${inv.id}`}
                    className="font-medium text-sm font-mono hover:underline"
                  >
                    {inv.number ?? "(Entwurf)"}
                  </Link>
                  <span className="badge" style={{ background: "rgb(var(--linen))", color: "rgb(var(--smoke))" }}>
                    {KIND_LABEL[inv.kind] ?? inv.kind}
                  </span>
                  {inv.reminderLevel > 0 && (
                    <span className="badge" style={{ background: "rgb(var(--accent-soft))", color: "rgb(var(--accent-deep))" }}>
                      <Bell size={9} />
                      {inv.reminderLevel === 1 ? "Erinnerung" : inv.reminderLevel === 2 ? "1. Mahnung" : "2. Mahnung"}
                    </span>
                  )}
                </div>
                <div className="text-xs text-smoke mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{formatDate(inv.issueDate)}</span>
                  {inv.status === "ISSUED" && (
                    <span style={{ color: isOverdue ? "rgb(var(--accent))" : undefined }}>
                      fällig {formatDate(inv.dueDate)}
                      {isOverdue && ` (${daysOverdue} ${daysOverdue === 1 ? "Tag" : "Tage"} überfällig)`}
                    </span>
                  )}
                  {inv.paidAt && <span>bezahlt {formatDate(inv.paidAt)}</span>}
                  {inv.shootingTitle && !compact && <span className="text-ink/60">· {inv.shootingTitle}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium tabular-nums">{eurFromCents(inv.totalCents)}</div>
                <span className="badge mt-1" style={{ background: statusMeta.bg, color: statusMeta.color }}>
                  {statusMeta.label}
                </span>
              </div>
              {/* Quick-Actions: nur für offene/versendete Rechnungen */}
              {isPayable && !compact && (
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  {!inv.sentAt && (
                    <button
                      onClick={() => onMarkSent(inv.id)}
                      className="text-[10px] px-2 py-1 rounded bg-paper border border-stone hover:bg-linen whitespace-nowrap"
                    >
                      versendet
                    </button>
                  )}
                  <button
                    onClick={() => onMarkPaid(inv.id)}
                    className="text-[10px] px-2 py-1 rounded text-white whitespace-nowrap"
                    style={{ background: "rgb(var(--ink))" }}
                  >
                    bezahlt
                  </button>
                </div>
              )}
              <Link href={`/buchhaltung/${inv.id}`} className="btn-icon shrink-0">
                <ChevronRight size={14} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function getStatusMeta(status: string, isOverdue: boolean) {
  // Farben kommen aus dem aktiven Theme — funktioniert in Lisa/Studio/Midnight gleichermaßen.
  // bg + color werden separat geliefert, weil `${color}15`-Concat mit rgb()-Strings nicht klappt.
  if (status === "PAID")      return { Icon: CheckCircle2,  color: "rgb(var(--success))", bg: "rgb(var(--success-soft))", label: "Bezahlt" };
  if (status === "CANCELLED") return { Icon: CircleSlash,   color: "rgb(var(--taupe))",   bg: "rgb(var(--linen))",        label: "Storniert" };
  if (status === "DRAFT")     return { Icon: CircleDashed,  color: "rgb(var(--taupe))",   bg: "rgb(var(--linen))",        label: "Entwurf" };
  if (isOverdue)              return { Icon: AlertTriangle, color: "rgb(var(--accent))",  bg: "rgb(var(--accent-soft))",  label: "Überfällig" };
  return                              { Icon: Receipt,      color: "rgb(var(--ink))",     bg: "rgb(var(--linen))",        label: "Offen" };
}
