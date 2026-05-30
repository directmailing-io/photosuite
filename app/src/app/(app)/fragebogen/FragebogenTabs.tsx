import Link from "next/link";
import { cn } from "@/lib/utils";

export function FragebogenTabs({ active }: { active: "antworten" | "vorlagen" }) {
  return (
    <div className="flex items-center gap-1 bg-paper border border-stone rounded-lg p-1 mb-6 w-fit">
      <Link
        href="/fragebogen"
        className={cn(
          "px-4 h-9 inline-flex items-center text-sm font-medium rounded-md transition",
          active === "antworten" ? "bg-ink text-bg" : "text-smoke hover:text-ink",
        )}
      >
        Antworten
      </Link>
      <Link
        href="/fragebogen/vorlagen"
        className={cn(
          "px-4 h-9 inline-flex items-center text-sm font-medium rounded-md transition",
          active === "vorlagen" ? "bg-ink text-bg" : "text-smoke hover:text-ink",
        )}
      >
        Vorlagen
      </Link>
    </div>
  );
}
