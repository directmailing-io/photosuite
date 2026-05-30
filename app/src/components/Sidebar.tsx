"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package as PackageIcon,
  Camera,
  CheckSquare,
  Settings,
  LogOut,
  UsersRound,
  FileQuestion,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: any;
  badgeCount?: number;
};

const dailyItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kunden", label: "Kunden", icon: Users },
  { href: "/shootings", label: "Shootings", icon: Camera },
  { href: "/aufgaben", label: "Aufgaben", icon: CheckSquare },
  { href: "/buchhaltung", label: "Buchhaltung", icon: Receipt },
];

const setupItems: NavItem[] = [
  { href: "/pakete", label: "Pakete", icon: PackageIcon },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/fragebogen", label: "Fragebögen", icon: FileQuestion },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function Sidebar({
  userName,
  studioName,
  newQuestionnaireSubmissions = 0,
}: {
  userName?: string | null;
  studioName?: string | null;
  newQuestionnaireSubmissions?: number;
}) {
  const pathname = usePathname();

  // Inject badge into setup items
  const setupWithBadges = setupItems.map((it) =>
    it.href === "/fragebogen"
      ? { ...it, badgeCount: newQuestionnaireSubmissions }
      : it,
  );

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-stone/60 bg-paper/50 flex flex-col">
      <div className="px-5 pt-7 pb-6">
        <Link href="/" className="block select-none leading-none" style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontSize: "32px",
          letterSpacing: "-0.01em",
        }}>
          <span style={{ fontStyle: "italic", fontWeight: 400, color: "var(--ink)" }}>photo</span>
          <span style={{ fontWeight: 600, color: "var(--accent)" }}>suite</span>
        </Link>
      </div>

      <nav className="px-3 flex-1 overflow-y-auto">
        <NavSection items={dailyItems} pathname={pathname} />
        <NavSection
          label="Setup"
          items={setupWithBadges}
          pathname={pathname}
          className="mt-6"
        />
      </nav>

      <div className="p-3 border-t border-stone/60">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="avatar w-9 h-9 text-xs bg-ink text-bg">
            {(userName ?? "L").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-ink truncate">{userName ?? "User"}</div>
            <div className="text-[11px] text-smoke">Eingeloggt</div>
          </div>
          <form action="/api/auth/signout" method="POST">
            <button type="submit" className="btn-icon" title="Abmelden">
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function NavSection({
  label,
  items,
  pathname,
  className,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <div className="eyebrow eyebrow-muted px-3 mb-2 text-[10px]">{label}</div>
      )}
      <div className="space-y-0.5">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn("nav-link", active && "active")}
            >
              <Icon size={17} strokeWidth={1.75} />
              <span className="flex-1">{it.label}</span>
              {it.badgeCount != null && it.badgeCount > 0 && (
                <span
                  className="text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center"
                  style={{ background: "var(--accent)", color: "white" }}
                  title={`${it.badgeCount} neue`}
                >
                  {it.badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
