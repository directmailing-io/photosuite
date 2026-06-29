"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { toggleTask } from "@/app/(app)/aufgaben/actions";
import { formatDate } from "@/lib/utils";

export type QuickTask = {
  id: string;
  title: string;
  dueAt: string | null; // ISO
  customerId: string | null;
  customerName: string | null;
  shootingId: string | null;
  shootingTitle: string | null;
};

/**
 * Dashboard-Aufgaben-Liste mit Quick-Toggle (Checkbox) + Klick-Navigation
 * zur verknüpften Aufgaben-Detail-Page.
 *
 * UX-Gotcha: Checkbox + Body-Link in einem Item. Checkbox-Click darf NICHT
 * den Link triggern, daher stopPropagation + getrenntes Button-Element.
 *
 * Optimistic-UI: bei Toggle sofort visuell durchstreichen + nach 280ms aus
 * der Liste entfernen. Bei Server-Fehler: revert + Toast.
 */
export function QuickTaskList({ tasks: initial }: { tasks: QuickTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<QuickTask[]>(initial);
  const [optimistic, setOptimistic] = useState<Set<string>>(new Set()); // ids, die als "done" optimistisch markiert sind
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function targetHref(t: QuickTask): string {
    if (t.shootingId) return `/shootings/${t.shootingId}`;
    if (t.customerId) return `/kunden/${t.customerId}`;
    return "/aufgaben";
  }

  function onToggle(id: string) {
    if (pendingIds.has(id)) return; // Doppelklick-Schutz

    setOptimistic((s) => new Set(s).add(id));
    setPendingIds((s) => new Set(s).add(id));

    startTransition(async () => {
      try {
        await toggleTask(id, true);
        // Nach kurzer Animation aus Liste entfernen + Page-Refresh
        setTimeout(() => {
          setTasks((ts) => ts.filter((x) => x.id !== id));
          router.refresh();
        }, 280);
      } catch (e: any) {
        // Revert
        setOptimistic((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        toast.error(e?.message ?? "Konnte Aufgabe nicht aktualisieren.");
      } finally {
        setPendingIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    });
  }

  if (tasks.length === 0) {
    return <div className="px-6 py-8 text-center text-sm text-smoke">Alles erledigt 🎉</div>;
  }

  return (
    <ul>
      {tasks.map((t) => {
        const isDone = optimistic.has(t.id);
        const isPending = pendingIds.has(t.id);
        return (
          <li
            key={t.id}
            className="px-4 py-3 border-t border-stone/60 first:border-0 flex items-center gap-3 hover:bg-linen/50 transition-colors"
            style={{ opacity: isDone ? 0.45 : 1, transition: "opacity 250ms ease" }}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={isDone}
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggle(t.id);
              }}
              className="shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all hover:scale-105 disabled:cursor-progress"
              style={{
                borderColor: isDone ? "rgb(var(--success))" : "rgb(var(--stone))",
                background: isDone ? "rgb(var(--success))" : "transparent",
              }}
              title={isDone ? "Erledigt" : "Als erledigt markieren"}
            >
              {isDone && <Check size={12} strokeWidth={3} style={{ color: "rgb(var(--paper))" }} />}
            </button>

            <Link href={targetHref(t)} className="flex-1 min-w-0 flex items-center gap-3 group">
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium truncate group-hover:underline"
                  style={{ textDecoration: isDone ? "line-through" : undefined }}
                >
                  {t.title}
                </div>
                <div className="text-xs text-smoke mt-0.5 truncate">
                  {t.dueAt && formatDate(new Date(t.dueAt))}
                  {t.dueAt && (t.shootingTitle || t.customerName) && " · "}
                  {t.shootingTitle ?? t.customerName ?? ""}
                </div>
              </div>
              <ChevronRight size={14} className="text-smoke shrink-0 opacity-0 group-hover:opacity-100 transition" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
