"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Trash2, AlertTriangle, Check, Circle, Send } from "lucide-react";
import { toast } from "sonner";
import { addShootingNote, setShootingNoteStatus, deleteShootingNote } from "../actions";
import { relativeDate } from "@/lib/utils";

type Note = { id: string; text: string; status: string; createdAt: string };

const STATUS = {
  OPEN: { label: "Offen", color: "#7D7878", icon: Circle },
  DONE: { label: "Erledigt", color: "#19191A", icon: Check },
  IMPORTANT: { label: "Sehr wichtig", color: "#C8102E", icon: AlertTriangle },
} as const;

export function NotesManager({ shootingId, notes }: { shootingId: string; notes: Note[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<keyof typeof STATUS>("OPEN");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | keyof typeof STATUS>("ALL");

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("text", text);
    fd.set("status", status);
    try {
      await addShootingNote(shootingId, fd);
      setText("");
      setStatus("OPEN");
      toast.success("Notiz angelegt");
      router.refresh();
    } finally { setBusy(false); }
  }

  async function setStat(id: string, st: string) {
    await setShootingNoteStatus(id, st, shootingId);
    router.refresh();
  }
  async function onDel(id: string) {
    if (!confirm("Notiz löschen?")) return;
    await deleteShootingNote(id, shootingId);
    router.refresh();
  }

  const filtered = filter === "ALL" ? notes : notes.filter((n) => n.status === filter);
  const sortKey = (n: Note) => (n.status === "IMPORTANT" ? 0 : n.status === "OPEN" ? 1 : 2);
  const sorted = [...filtered].sort((a, b) => sortKey(a) - sortKey(b) || (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow eyebrow-muted flex items-center gap-2"><MessageSquare size={13} /> Notizen</div>
        <div className="flex items-center gap-1 text-xs">
          {(["ALL", "IMPORTANT", "OPEN", "DONE"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className="px-2 py-1 rounded-md transition"
              style={{
                background: filter === k ? "var(--ink)" : "transparent",
                color: filter === k ? "var(--bg)" : "var(--smoke)",
              }}
            >
              {k === "ALL" ? "Alle" : STATUS[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      <form ref={formRef} onSubmit={onAdd} className="space-y-2 mb-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Notiz schreiben — Hashtag-frei. Drück Enter zum Bestätigen."
          className="textarea text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
        />
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
        <div className="text-sm text-smoke text-center py-4">Keine Notizen.</div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((n) => {
            const meta = STATUS[n.status as keyof typeof STATUS] ?? STATUS.OPEN;
            const Icon = meta.icon;
            return (
              <li
                key={n.id}
                className="group p-3 rounded-lg border"
                style={{
                  background: n.status === "IMPORTANT" ? `${meta.color}08` : "var(--paper)",
                  borderColor: n.status === "IMPORTANT" ? `${meta.color}30` : "var(--stone)",
                  borderLeftWidth: 3,
                  borderLeftColor: meta.color,
                }}
              >
                <div className="flex items-start gap-3">
                  <Icon size={14} className="mt-1 shrink-0" style={{ color: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm whitespace-pre-wrap ${n.status === "DONE" ? "text-smoke line-through" : "text-ink"}`}
                    >
                      {n.text}
                    </div>
                    <div className="text-[11px] text-smoke mt-1.5 flex items-center gap-3">
                      <span>{relativeDate(n.createdAt)}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        {(Object.keys(STATUS) as Array<keyof typeof STATUS>)
                          .filter((k) => k !== n.status)
                          .map((k) => (
                            <button
                              key={k}
                              onClick={() => setStat(n.id, k)}
                              className="px-1.5 py-0.5 rounded text-[10px] hover:bg-linen"
                              style={{ color: STATUS[k].color }}
                            >
                              → {STATUS[k].label}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => onDel(n.id)} className="btn-icon opacity-0 group-hover:opacity-100">
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
