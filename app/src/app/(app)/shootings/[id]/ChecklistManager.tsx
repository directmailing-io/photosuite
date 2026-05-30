"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ListChecks, Eye, EyeOff, CalendarClock, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  addChecklist,
  deleteChecklist,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  setChecklistAudience,
  setChecklistItemDeadline,
} from "../actions";
import { formatDate } from "@/lib/utils";

type Item = { id: string; label: string; done: boolean; dueAt: string | null };
type Checklist = { id: string; title: string; audience: string; items: Item[] };

export function ChecklistManager({
  shootingId,
  checklists,
}: {
  shootingId: string;
  checklists: Checklist[];
}) {
  const router = useRouter();
  const [newListTitle, setNewListTitle] = useState("");
  const [newListAudience, setNewListAudience] = useState<"INTERNAL" | "CUSTOMER">("INTERNAL");

  async function onAddList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    const fd = new FormData();
    fd.set("title", newListTitle);
    fd.set("audience", newListAudience);
    await addChecklist(shootingId, fd);
    setNewListTitle("");
    router.refresh();
  }

  async function onToggleAud(id: string, current: string) {
    const next = current === "CUSTOMER" ? "INTERNAL" : "CUSTOMER";
    await setChecklistAudience(id, next, shootingId);
    router.refresh();
  }

  async function onAddItem(checklistId: string, label: string, dueAt: string | null) {
    if (!label.trim()) return;
    const fd = new FormData();
    fd.set("label", label);
    if (dueAt) fd.set("dueAt", dueAt);
    await addChecklistItem(checklistId, shootingId, fd);
    router.refresh();
  }
  async function onToggle(itemId: string, done: boolean) {
    await toggleChecklistItem(itemId, done, shootingId);
    router.refresh();
  }
  async function onDelItem(itemId: string) {
    await deleteChecklistItem(itemId, shootingId);
    router.refresh();
  }
  async function onDelList(checklistId: string) {
    if (!confirm("Diese Checkliste löschen?")) return;
    await deleteChecklist(checklistId, shootingId);
    router.refresh();
  }
  async function onSetDeadline(itemId: string, dueAt: string | null) {
    await setChecklistItemDeadline(itemId, dueAt, shootingId);
    router.refresh();
  }

  const customer = checklists.filter((c) => c.audience === "CUSTOMER");
  const internal = checklists.filter((c) => c.audience === "INTERNAL");

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow eyebrow-muted flex items-center gap-2"><ListChecks size={13} /> Checklisten</div>
      </div>

      {customer.length > 0 && (
        <AudienceSection title="Für die Kundin" icon={<Eye size={11} />} accent>
          {customer.map((cl) => (
            <ChecklistBlock
              key={cl.id}
              cl={cl}
              onToggleAud={onToggleAud}
              onAddItem={onAddItem}
              onToggle={onToggle}
              onDelItem={onDelItem}
              onDelList={onDelList}
              onSetDeadline={onSetDeadline}
            />
          ))}
        </AudienceSection>
      )}

      {internal.length > 0 && (
        <AudienceSection title="Intern" icon={<EyeOff size={11} />}>
          {internal.map((cl) => (
            <ChecklistBlock
              key={cl.id}
              cl={cl}
              onToggleAud={onToggleAud}
              onAddItem={onAddItem}
              onToggle={onToggle}
              onDelItem={onDelItem}
              onDelList={onDelList}
              onSetDeadline={onSetDeadline}
            />
          ))}
        </AudienceSection>
      )}

      <form onSubmit={onAddList} className="hairline mt-5 pt-5 flex gap-2 items-center">
        <select
          value={newListAudience}
          onChange={(e) => setNewListAudience(e.target.value as any)}
          className="select w-32 h-9 text-xs"
        >
          <option value="INTERNAL">Intern</option>
          <option value="CUSTOMER">Kundin</option>
        </select>
        <input
          value={newListTitle}
          onChange={(e) => setNewListTitle(e.target.value)}
          placeholder="Neue Liste…"
          className="input flex-1 h-9 text-sm"
        />
        <button className="btn-primary h-9 px-3"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function AudienceSection({
  title, icon, accent, children,
}: {
  title: string; icon: React.ReactNode; accent?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="badge" style={{
          background: accent ? "var(--accent-soft)" : "var(--linen)",
          color: accent ? "var(--accent-deep)" : "var(--smoke)",
        }}>
          {icon} {title}
        </span>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function ChecklistBlock({
  cl, onToggleAud, onAddItem, onToggle, onDelItem, onDelList, onSetDeadline,
}: {
  cl: Checklist;
  onToggleAud: (id: string, current: string) => void;
  onAddItem: (id: string, label: string, dueAt: string | null) => void;
  onToggle: (id: string, done: boolean) => void;
  onDelItem: (id: string) => void;
  onDelList: (id: string) => void;
  onSetDeadline: (id: string, dueAt: string | null) => void;
}) {
  const done = cl.items.filter((i) => i.done).length;
  const total = cl.items.length;
  return (
    <div className="group/cl">
      <div className="flex items-center justify-between mb-2">
        <div className="font-medium text-sm">{cl.title}</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-smoke tabular-nums">{done}/{total}</div>
          <button onClick={() => onToggleAud(cl.id, cl.audience)} className="btn-icon opacity-0 group-hover/cl:opacity-100" title="Sichtbarkeit umschalten">
            {cl.audience === "CUSTOMER" ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button onClick={() => onDelList(cl.id)} className="btn-icon opacity-0 group-hover/cl:opacity-100">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {total > 0 && (
        <div className="h-1 rounded-full bg-linen overflow-hidden mb-3">
          <div className="h-full" style={{ background: cl.audience === "CUSTOMER" ? "var(--accent)" : "var(--ink)", width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-1">
        {cl.items.map((item) => (
          <ItemRow key={item.id} item={item} onToggle={onToggle} onDel={onDelItem} onSetDeadline={onSetDeadline} />
        ))}
      </ul>
      <AddItemRow onAdd={(label, dueAt) => onAddItem(cl.id, label, dueAt)} />
    </div>
  );
}

function ItemRow({
  item, onToggle, onDel, onSetDeadline,
}: {
  item: Item;
  onToggle: (id: string, done: boolean) => void;
  onDel: (id: string) => void;
  onSetDeadline: (id: string, dueAt: string | null) => void;
}) {
  const [editingDate, setEditingDate] = useState(false);

  const overdue = item.dueAt && !item.done && new Date(item.dueAt) < new Date();
  const dateColor = item.done ? "var(--smoke)" : overdue ? "var(--accent)" : "var(--smoke)";

  return (
    <li className="flex items-center gap-2 group/item">
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        className="w-4 h-4 accent-ink"
      />
      <span className={`text-sm flex-1 ${item.done ? "text-smoke line-through" : "text-ink"}`}>{item.label}</span>

      {editingDate ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const v = String(fd.get("dueAt") ?? "");
            onSetDeadline(item.id, v || null);
            setEditingDate(false);
          }}
          className="flex items-center gap-1"
        >
          <input
            type="date"
            name="dueAt"
            defaultValue={item.dueAt ? item.dueAt.slice(0, 10) : ""}
            autoFocus
            className="input h-7 text-xs w-32"
          />
          <button type="submit" className="btn-icon h-6 w-6"><Check size={12} /></button>
          <button type="button" onClick={() => setEditingDate(false)} className="btn-icon h-6 w-6"><X size={12} /></button>
        </form>
      ) : (
        <>
          {item.dueAt ? (
            <button
              onClick={() => setEditingDate(true)}
              className="text-xs flex items-center gap-1 hover:underline"
              style={{ color: dateColor }}
              title="Deadline bearbeiten"
            >
              <CalendarClock size={11} /> {formatDate(item.dueAt)}
            </button>
          ) : (
            <button
              onClick={() => setEditingDate(true)}
              className="btn-icon opacity-0 group-hover/item:opacity-100"
              title="Deadline setzen"
            >
              <CalendarClock size={12} />
            </button>
          )}
          <button onClick={() => onDel(item.id)} className="btn-icon opacity-0 group-hover/item:opacity-100">
            <Trash2 size={12} />
          </button>
        </>
      )}
    </li>
  );
}

function AddItemRow({ onAdd }: { onAdd: (label: string, dueAt: string | null) => void }) {
  const [v, setV] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [date, setDate] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.trim()) return;
    onAdd(v, date || null);
    setV("");
    setDate("");
    setShowDate(false);
  }
  return (
    <form onSubmit={submit} className="flex gap-1.5 mt-2 ml-6 items-center">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Punkt hinzufügen…" className="input h-8 text-sm flex-1" />
      {showDate ? (
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input h-8 text-xs w-32" />
      ) : (
        <button type="button" onClick={() => setShowDate(true)} className="btn-icon h-8 w-8" title="Deadline">
          <CalendarClock size={12} />
        </button>
      )}
      <button className="btn-ghost h-8 px-2"><Plus size={14} /></button>
    </form>
  );
}
