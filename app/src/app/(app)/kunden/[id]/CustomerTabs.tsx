import Link from "next/link";
import { cn } from "@/lib/utils";
import { Camera, Receipt, Heart, History } from "lucide-react";

export type CustomerTab = "shootings" | "rechnungen" | "personen" | "verlauf";

type TabDef = {
  key: CustomerTab;
  label: string;
  icon: any;
  count?: number;
  accent?: boolean;
};

export function CustomerTabs({
  customerId,
  active,
  counts,
}: {
  customerId: string;
  active: CustomerTab;
  counts: { shootings: number; rechnungen: number; personen: number; openInvoices: number };
}) {
  const tabs: TabDef[] = [
    { key: "shootings",  label: "Shootings",       icon: Camera,  count: counts.shootings },
    { key: "rechnungen", label: "Rechnungen",      icon: Receipt, count: counts.rechnungen, accent: counts.openInvoices > 0 },
    { key: "personen",   label: "Begleitpersonen", icon: Heart,   count: counts.personen },
    { key: "verlauf",    label: "Verlauf & Notizen", icon: History },
  ];

  return (
    <nav className="border-b border-stone/70">
      <ul className="flex items-end gap-1 -mb-px overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <li key={t.key}>
              <Link
                href={t.key === "shootings" ? `/kunden/${customerId}` : `/kunden/${customerId}?tab=${t.key}`}
                className={cn(
                  "inline-flex items-center gap-2 px-4 h-11 text-sm font-medium transition border-b-2 whitespace-nowrap",
                  isActive
                    ? "border-ink text-ink"
                    : "border-transparent text-smoke hover:text-ink",
                )}
                style={{
                  fontFamily: '"Montserrat", "Open Sans", sans-serif',
                  letterSpacing: "0.02em",
                }}
              >
                <Icon size={15} strokeWidth={1.75} />
                <span>{t.label}</span>
                {typeof t.count === "number" && t.count > 0 && (
                  <span
                    className="badge tabular-nums"
                    style={{
                      background: t.accent ? "rgb(var(--accent-soft))" : "rgb(var(--linen))",
                      color: t.accent ? "rgb(var(--accent-deep))" : "rgb(var(--smoke))",
                      padding: "1px 7px",
                      fontSize: 10,
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
