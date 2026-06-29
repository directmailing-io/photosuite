"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Trash2, AlertTriangle, Check, Circle, Send, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  addShootingNote,
  setShootingNoteStatus,
  setShootingNoteCategory,
  deleteShootingNote,
} from "../actions";
import { relativeDate } from "@/lib/utils";

type Note = { id: string; text: string; status: string; category: string; createdAt: string };

export type NoteTemplateOption = {
  id: string;
  name: string;
  category: string;
  body: string;
};

const STATUS = {
  OPEN: { label: "Offen", color: "#7D7878", icon: Circle },
  DONE: { label: "Erledigt", color: "#19191A", icon: Check },
  IMPORTANT: { label: "Sehr wichtig", color: "#C8102E", icon: AlertTriangle },
} as const;

// 4 fix definierte Kategorien für den Workflow Erstgespräch → Bildauswahl → Retusche.
const CATEGORIES = [
  { key: "ALLGEMEIN", label: "Allgemein" },
  { key: "ERSTGESPRAECH", label: "Erstgespräch" },
  { key: "BILDAUSWAHL", label: "Bildauswahl" },
  { key: "RETUSCHE", label: "Retusche" },
] as const;

type CategoryKey = typeof CATEGORIES[number]["key"];

export function NotesManager({
  shootingId,
  notes,
  templates,
}: {
  shootingId: string;
  notes: Note[];
  templates: NoteTemplateOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<keyof typeof STATUS>("OPEN");
  const [category, setCategory] = useState<CategoryKey>("ALLGEMEIN");
  const [busy, setBusy] = useState(false);
  // Filter: "ALL" zeigt alle Kategorien gleichzeitig (mit Header-Gruppen).
  // Sonst nur die gewählte Kategorie als flache Liste.
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CategoryKey>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | keyof typeof STATUS>("ALL");
  const [tplOpen, setTplOpen] = useState(false);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("text", text);
    fd.set("status", status);
    fd.set("category", category);
    try {
      await addShootingNote(shootingId, fd);
      setText("");
      setStatus("OPEN");
      toast.success("Besprechung angelegt");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function setStat(id: string, st: string) {
    await setShootingNoteStatus(id, st, shootingId);
    router.refresh();
  }
  async function setCat(id: string, cat: string) {
    await setShootingNoteCategory(id, cat, shootingId);
    router.refresh();
  }
  async function onDel(id: string) {
    if (!confirm("Besprechung löschen?")) return;
    await deleteShootingNote(id, shootingId);
    router.refresh();
  }

  function applyTemplate(tpl: NoteTemplateOption) {
    setText(tpl.body);
    if (CATEGORIES.some((c) => c.key === tpl.category)) {
      setCategory(tpl.category as CategoryKey);
    }
    setTplOpen(false);
  }

  // Nach Filter + Status filtern und nach Wichtigkeit sortieren.
  const filtered = notes.filter((n) => {
    if (categoryFilter !== "ALL" && n.category !== categoryFilter) return false;
    if (statusFilter !== "ALL" && n.status !== statusFilter) return false;
    return true;
  });
  const sortKey = (n: Note) => (n.status === "IMPORTANT" ? 0 : n.status === "OPEN" ? 1 : 2);
  const sorted = [...filtered].sort((a, b) => sortKey(a) - sortKey(b) || (a.createdAt < b.createdAt ? 1 : -1));

  // Bei „Alle Kategorien" gruppieren wir nach Kategorie für bessere Übersicht.
  const grouped = categoryFilter === "ALL"
    ? CATEGORIES.map((c) => ({
        cat: c,
        items: sorted.filter((n) => n.category === c.key),
      })).filter((g) => g.items.length > 0)
    : null;

  const counts = CATEGORIES.reduce<Record<string, number>>((acc, c) => {
    acc[c.key] = notes.filter((n) => n.category === c.key).length;
    return acc;
  }, {});

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="eyebrow eyebrow-muted flex items-center gap-2"><MessageSquare size={13} /> Besprechungen</div>
        <div className="flex items-center gap-1 text-xs">
          {(["ALL", "IMPORTANT", "OPEN", "DONE"] as const).map((k) => {
            const isActive = statusFilter === k;
            return (
              <button
                key={k}
                onClick={() => setStatusFilter(k)}
                className="px-2 py-1 rounded-md transition"
                style={{
                  background: isActive ? "rgb(var(--ink))" : "rgb(var(--linen))",
                  color: isActive ? "rgb(var(--bg))" : "rgb(var(--taupe))",
                }}
              >
                {k === "ALL" ? "Alle" : STATUS[k].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Kategorie-Tabs */}
      <div className="flex items-center gap-1 mb-4 -mx-1 px-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setCategoryFilter("ALL")}
          className="text-[11px] px-2.5 py-1 rounded-full font-medium transition whitespace-nowrap"
          style={{
            background: categoryFilter === "ALL" ? "rgb(var(--ink))" : "transparent",
            color: categoryFilter === "ALL" ? "rgb(var(--bg))" : "rgb(var(--taupe))",
            border: "1px solid",
            borderColor: categoryFilter === "ALL" ? "rgb(var(--ink))" : "rgb(var(--stone))",
          }}
        >
          Alle Phasen
        </button>
        {CATEGORIES.map((c) => {
          const isActive = categoryFilter === c.key;
          const count = counts[c.key] ?? 0;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategoryFilter(c.key)}
              className="text-[11px] px-2.5 py-1 rounded-full font-medium transition whitespace-nowrap"
              style={{
                background: isActive ? "rgb(var(--ink))" : "transparent",
                color: isActive ? "rgb(var(--bg))" : "rgb(var(--taupe))",
                border: "1px solid",
                borderColor: isActive ? "rgb(var(--ink))" : "rgb(var(--stone))",
              }}
            >
              {c.label}{count > 0 ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>

      {/* Add form */}
      <form ref={formRef} onSubmit={onAdd} className="space-y-2 mb-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Mache dir Notizen zu diesem Shooting"
          className="textarea text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
        />

        {/* Kategorie + Vorlagen-Picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-smoke mr-1">Phase:</span>
            {CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className="text-[11px] px-2 py-0.5 rounded-md transition"
                  style={{
                    background: active ? "rgb(var(--ink))" : "rgb(var(--linen))",
                    color: active ? "rgb(var(--bg))" : "rgb(var(--taupe))",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {templates.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setTplOpen((v) => !v)}
                className="btn-ghost text-[11px] h-7 px-2"
              >
                <FileText size={11} /> Vorlage <ChevronDown size={10} />
              </button>
              {tplOpen && (
                <div
                  className="absolute z-20 mt-1 right-0 w-80 max-h-80 overflow-y-auto rounded-lg border shadow-md"
                  style={{ background: "rgb(var(--paper))", borderColor: "rgb(var(--stone))" }}
                >
                  {templates.map((t) => {
                    const catLabel = CATEGORIES.find((c) => c.key === t.category)?.label ?? t.category;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applyTemplate(t)}
                        className="w-full text-left px-3 py-2 hover:bg-linen transition text-xs border-b border-stone/40 last:border-0"
                      >
                        <div className="font-medium text-ink">{t.name}</div>
                        <div className="text-[10px] text-smoke mt-0.5">{catLabel}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(Object.keys(STATUS) as Array<keyof typeof STATUS>).map((k) => {
              const Icon = STATUS[k].icon;
              const active = status === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatus(k)}
                  className="badge"
                  style={{
                    background: active ? STATUS[k].color : `${STATUS[k].color}15`,
                    color: active ? "#fff" : STATUS[k].color,
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  <Icon size={11} /> {STATUS[k].label}
                </button>
              );
            })}
          </div>
          <button disabled={busy || !text.trim()} className="btn-primary h-9 px-3">
            <Send size={13} /> {busy ? "…" : "Absenden"}
          </button>
        </div>
      </form>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="text-sm text-smoke text-center py-4">Noch keine Besprechungen.</div>
      ) : grouped ? (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.cat.key}>
              <div className="eyebrow eyebrow-muted mb-2">{g.cat.label}</div>
              <ul className="space-y-2">
                {g.items.map((n) => (
                  <NoteRow key={n.id} note={n} onSetStatus={setStat} onSetCategory={setCat} onDelete={onDel} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((n) => (
            <NoteRow key={n.id} note={n} onSetStatus={setStat} onSetCategory={setCat} onDelete={onDel} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteRow({
  note,
  onSetStatus,
  onSetCategory,
  onDelete,
}: {
  note: Note;
  onSetStatus: (id: string, st: string) => Promise<void>;
  onSetCategory: (id: string, cat: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const meta = STATUS[note.status as keyof typeof STATUS] ?? STATUS.OPEN;
  const Icon = meta.icon;
  return (
    <li
      className="group p-3 rounded-lg border"
      style={{
        background: note.status === "IMPORTANT" ? `${meta.color}08` : "rgb(var(--paper))",
        borderColor: note.status === "IMPORTANT" ? `${meta.color}30` : "rgb(var(--stone))",
        borderLeftWidth: 3,
        borderLeftColor: meta.color,
      }}
    >
      <div className="flex items-start gap-3">
        <Icon size={14} className="mt-1 shrink-0" style={{ color: meta.color }} />
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm whitespace-pre-wrap ${note.status === "DONE" ? "text-smoke line-through" : "text-ink"}`}
          >
            {note.text}
          </div>
          <div className="text-[11px] text-smoke mt-1.5 flex items-center gap-3 flex-wrap">
            <span>{relativeDate(note.createdAt)}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
              {(Object.keys(STATUS) as Array<keyof typeof STATUS>)
                .filter((k) => k !== note.status)
                .map((k) => (
                  <button
                    key={k}
                    onClick={() => onSetStatus(note.id, k)}
                    className="px-1.5 py-0.5 rounded text-[10px] hover:bg-linen"
                    style={{ color: STATUS[k].color }}
                  >
                    → {STATUS[k].label}
                  </button>
                ))}
              <select
                value={note.category}
                onChange={(e) => onSetCategory(note.id, e.target.value)}
                className="text-[10px] bg-transparent border-0 text-smoke hover:text-ink cursor-pointer"
                aria-label="Phase wechseln"
                onClick={(e) => e.stopPropagation()}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <button onClick={() => onDelete(note.id)} className="btn-icon opacity-0 group-hover:opacity-100">
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}
