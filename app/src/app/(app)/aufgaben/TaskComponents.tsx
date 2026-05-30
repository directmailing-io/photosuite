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
                  <span className="flex items-center gap-1" style={{ color: overdue ? "var(--accent)" : undefined }}>
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
                  style={{ color: overdue ? "var(--accent)" : "var(--smoke)" }}
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
