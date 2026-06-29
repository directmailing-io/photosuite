import Link from "next/link";
import { cn } from "@/lib/utils";
import { Receipt, User, Tags, ListChecks, AlertCircle, CreditCard, Calendar as CalendarSync, Gift, CalendarCheck, Palette } from "lucide-react";

export type SettingsTab = "studio" | "rechnung" | "zahlungen" | "kalender" | "buchung" | "addons" | "status" | "tags" | "design";

type TabDef = {
  key: SettingsTab;
  label: string;
  icon: any;
};

const TABS: TabDef[] = [
  { key: "studio",    label: "Studio-Profil",    icon: User },
  { key: "rechnung",  label: "Rechnung",         icon: Receipt },
  { key: "zahlungen", label: "Zahlungen",        icon: CreditCard },
  { key: "kalender",  label: "Kalender",         icon: CalendarSync },
  { key: "buchung",   label: "Buchungslinks",    icon: CalendarCheck },
  { key: "addons",    label: "Produkte",         icon: Gift },
  { key: "status",    label: "Status",           icon: ListChecks },
  { key: "tags",      label: "Tags",             icon: Tags },
  { key: "design",    label: "Design",           icon: Palette },
];

export function SettingsTabs({
  active,
  invoiceIncomplete = false,
}: {
  active: SettingsTab;
  invoiceIncomplete?: boolean;
}) {
  return (
    <nav className="border-b border-stone/70 mb-8">
      <ul className="flex items-end gap-1 -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          const showWarn = t.key === "rechnung" && invoiceIncomplete;
          return (
            <li key={t.key}>
              <Link
                href={t.key === "studio" ? "/einstellungen" : `/einstellungen?tab=${t.key}`}
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
                {showWarn && (
                  <AlertCircle size={13} className="text-accent" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
