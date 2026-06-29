"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toggleTask, deleteTask, createTask } from "./actions";
import { toggleChecklistItem } from "../shootings/actions";
import { Trash2, Plus, User, Camera, CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

type TaskUI = {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  dueAt: string | null;
  customer: { id: string; name: string } | null;
  shooting: { id: string; title: string } | null;
};

export function TaskList({ tasks }: { tasks: TaskUI[] }) {
  const router = useRouter();

  async function onToggle(id: string, done: boolean) {
    await toggleTask(id, done);
    router.refresh();
  }
  async function onDel(id: string) {
    if (!confirm("Aufgabe löschen?")) return;
    await deleteTask(id);
    router.refresh();
  }

  return (
    <ul>
      {tasks.map((t) => {
        const overdue = t.dueAt && !t.done && new Date(t.dueAt) < new Date(Date.now() - 86400_000);
        return (
          <li key={t.id} className="px-5 py-4 border-t border-stone/60 first:border-0 flex items-start gap-3 group hover:bg-linen/50">
            <input
              type="checkbox"
              checked={t.done}
              onChange={(e) => onToggle(t.id, e.target.checked)}
              className="w-4 h-4 mt-1 accent-ink"
            />
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${t.done ? "text-smoke line-through" : "text-ink font-medium"}`}>{t.title}</div>
              {t.description && (
                <div className="text-xs text-smoke mt-1 whitespace-pre-wrap">{t.description}</div>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-smoke">
                {t.dueAt && (
                  <span className="flex items-center gap-1" style={{ color: overdue ? "rgb(var(--accent))" : undefined }}>
                    <CalendarClock size={12} /> {formatDate(t.dueAt)}
                  </span>
                )}
                {t.customer && (
                  <Link href={`/kunden/${t.customer.id}`} className="flex items-center gap-1 hover:underline">
                    <User size={12} /> {t.customer.name}
                  </Link>
                )}
                {t.shooting && (
                  <Link href={`/shootings/${t.shooting.id}`} className="flex items-center gap-1 hover:underline">
                    <Camera size={12} /> {t.shooting.title}
                  </Link>
                )}
              </div>
            </div>
            <button onClick={() => onDel(t.id)} className="btn-icon opacity-0 group-hover:opacity-100">
              <Trash2 size={14} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type CLItem = { id: string; label: string; done: boolean; dueAt: string | null };
type CL = { id: string; title: string; items: CLItem[] };

export function ChecklistRowGroup({ shootingId, checklist }: { shootingId: string; checklist: CL }) {
  const router = useRouter();
  async function onToggle(itemId: string, done: boolean) {
    await toggleChecklistItem(itemId, done, shootingId);
    router.refresh();
  }
  return (
    <div>
      <div className="text-xs font-semibold text-smoke mb-1.5 uppercase tracking-wider">{checklist.title}</div>
      <ul className="space-y-1">
        {checklist.items.map((it) => {
          const overdue = it.dueAt && !it.done && new Date(it.dueAt) < new Date();
          return (
            <li key={it.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={it.done}
                onChange={(e) => onToggle(it.id, e.target.checked)}
                className="w-4 h-4 accent-ink"
              />
              <span className={it.done ? "text-smoke line-through flex-1" : "text-ink flex-1"}>{it.label}</span>
              {it.dueAt && (
                <span
                  className="text-xs flex items-center gap-1 tabular-nums"
                  style={{ color: overdue ? "rgb(var(--accent))" : "rgb(var(--smoke))" }}
                >
                  <CalendarClock size={11} /> {formatDate(it.dueAt)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewTaskForm({ customers }: { customers: { id: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await createTask(new FormData(e.currentTarget));
      (e.currentTarget as HTMLFormElement).reset();
      toast.success("Aufgabe angelegt");
      router.refresh();
    } catch (err) {
      toast.error("Konnte nicht speichern");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="title" placeholder="Was ist zu tun?" className="input" required />
      <textarea name="description" placeholder="Notiz (optional)" rows={2} className="textarea" />
      <input type="date" name="dueAt" className="input" />
      <select name="customerId" className="select">
        <option value="">— Kundin verknüpfen —</option>
        {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <button disabled={busy} className="btn-primary w-full">
        <Plus size={14} /> {busy ? "Speichern…" : "Aufgabe anlegen"}
      </button>
    </form>
  );
}

export type FlatTaskItem = {
  id: string;                    // einzigartig, z.B. „task:<id>" oder „cl:<id>"
  sourceKind: "task" | "checklist";
  sourceId: string;              // Original-ID in der jeweiligen Tabelle
  shootingId: string | null;     // für ChecklistItem-Toggle gebraucht
  checklistId: string | null;
  title: string;
  description: string | null;
  done: boolean;
  dueAt: string | null;
  customer: { id: string; name: string } | null;
  shooting: { id: string; title: string } | null;
};

/**
 * Flat-Liste aus Tasks + ChecklistItems, sortiert nach Fälligkeit.
 * Wird in /aufgaben gerendert und ersetzt die alte „pro Shooting"-Gruppierung.
 *
 * Pro Eintrag:
 *  - Checkbox links → toggelt je nach sourceKind (toggleTask vs. toggleChecklistItem)
 *  - Titel + Description
 *  - Shooting-Pill als anklickbarer Link (führt zur Shooting-Detail-Seite)
 *  - Due-Date mit Überfällig-Highlight
 */
export function FlatTaskList({ items }: { items: FlatTaskItem[] }) {
  const router = useRouter();
  const now = Date.now();

  async function onToggle(item: FlatTaskItem) {
    try {
      if (item.sourceKind === "task") {
        await toggleTask(item.sourceId, !item.done);
      } else if (item.shootingId) {
        // toggleChecklistItem(itemId, done, shootingId)
        await toggleChecklistItem(item.sourceId, !item.done, item.shootingId);
      }
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Konnte nicht ändern");
    }
  }

  async function onDelete(item: FlatTaskItem) {
    if (item.sourceKind !== "task") return;          // ChecklistItems werden in der Shooting-Detail gelöscht
    if (!confirm("Aufgabe löschen?")) return;
    try {
      await deleteTask(item.sourceId);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Konnte nicht löschen");
    }
  }

  if (items.length === 0) {
    return <div className="px-5 py-6 text-sm text-smoke text-center">Keine Aufgaben.</div>;
  }

  return (
    <ul className="divide-y divide-stone/60">
      {items.map((item) => {
        const overdue = !item.done && item.dueAt && new Date(item.dueAt).getTime() < now;
        return (
          <li key={item.id} className="px-5 py-3 flex items-start gap-3 group">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              onClick={() => onToggle(item)}
              className="shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 transition hover:scale-105"
              style={{
                borderColor: item.done ? "rgb(var(--success))" : "rgb(var(--stone))",
                background: item.done ? "rgb(var(--success))" : "transparent",
              }}
              title={item.done ? "Erledigt" : "Erledigen"}
            >
              {item.done && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 5.5L4.5 8.5L9.5 2.5" stroke="rgb(var(--paper))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div
                className="text-sm leading-tight"
                style={{
                  color: item.done ? "rgb(var(--taupe))" : "rgb(var(--ink))",
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                {item.title}
              </div>
              {item.description && (
                <div className="text-xs text-smoke mt-1 line-clamp-2">{item.description}</div>
              )}
              <div className="text-[11px] text-smoke mt-1.5 flex items-center gap-2 flex-wrap">
                {item.dueAt && (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: overdue ? "rgb(var(--accent))" : "rgb(var(--taupe))" }}
                  >
                    <CalendarClock size={11} />
                    {formatDate(new Date(item.dueAt))}
                  </span>
                )}
                {item.shooting && (
                  <Link
                    href={`/shootings/${item.shooting.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition hover:bg-linen"
                    style={{
                      background: "rgb(var(--linen))",
                      color: "rgb(var(--taupe))",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Camera size={9} /> {item.shooting.title}
                  </Link>
                )}
                {item.customer && (
                  <Link
                    href={`/kunden/${item.customer.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition hover:bg-linen"
                    style={{
                      background: "rgb(var(--linen))",
                      color: "rgb(var(--taupe))",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <User size={9} /> {item.customer.name}
                  </Link>
                )}
                {item.sourceKind === "checklist" && (
                  <span className="text-[10px] text-smoke italic">Aus Checkliste</span>
                )}
              </div>
            </div>

            {item.sourceKind === "task" && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                className="btn-icon opacity-0 group-hover:opacity-100 transition"
                style={{ color: "rgb(var(--accent))" }}
                title="Löschen"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
