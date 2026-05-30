"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";

type StatusItem = { id: string; label: string; color: string; isDone?: boolean };

export function StatusManager({
  title,
  subtitle,
  items,
  createAction,
  updateAction,
  deleteAction,
  withDoneFlag = false,
}: {
  title: string;
  subtitle: string;
  items: StatusItem[];
  createAction: (fd: FormData) => Promise<void>;
  updateAction: (id: string, fd: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  withDoneFlag?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#C8102E");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const fd = new FormData();
    fd.set("label", newLabel);
    fd.set("color", newColor);
    await createAction(fd);
    setNewLabel("");
    toast.success("Hinzugefügt");
    router.refresh();
  }

  async function onUpdate(id: string, fd: FormData) {
    await updateAction(id, fd);
    setEditing(null);
    toast.success("Gespeichert");
    router.refresh();
  }

  async function onDel(id: string) {
    if (!confirm("Wirklich löschen? Bestehende Datensätze verlieren diesen Status.")) return;
    await deleteAction(id);
    toast.success("Gelöscht");
    router.refresh();
  }

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="font-serif text-xl">{title}</div>
        <div className="text-xs text-smoke mt-0.5">{subtitle}</div>
      </div>

      <ul className="space-y-1.5 mb-4">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-linen group">
            {editing === it.id ? (
              <EditRow item={it} onSave={(fd) => onUpdate(it.id, fd)} onCancel={() => setEditing(null)} withDoneFlag={withDoneFlag} />
            ) : (
              <>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: it.color }} />
                <span className="text-sm font-medium flex-1">{it.label}</span>
                {it.isDone && <span className="badge bg-linen text-smoke">Erledigt-Status</span>}
                <button onClick={() => setEditing(it.id)} className="btn-icon opacity-0 group-hover:opacity-100">
                  <Pencil size={13} />
                </button>
                <button onClick={() => onDel(it.id)} className="btn-icon opacity-0 group-hover:opacity-100">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onCreate} className="hairline pt-4 flex items-center gap-2">
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-10 w-12 rounded-lg border border-stone bg-paper cursor-pointer" />
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Neuer Status…" className="input flex-1" />
        <button className="btn-primary"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function EditRow({
  item,
  onSave,
  onCancel,
  withDoneFlag,
}: {
  item: StatusItem;
  onSave: (fd: FormData) => Promise<void>;
  onCancel: () => void;
  withDoneFlag: boolean;
}) {
  return (
    <form
      className="flex items-center gap-2 flex-1"
      onSubmit={(e) => { e.preventDefault(); onSave(new FormData(e.currentTarget)); }}
    >
      <input type="color" name="color" defaultValue={item.color} className="h-9 w-10 rounded border border-stone bg-paper cursor-pointer" />
      <input name="label" defaultValue={item.label} className="input flex-1 h-9" required />
      {withDoneFlag && (
        <label className="flex items-center gap-1 text-xs text-smoke whitespace-nowrap">
          <input type="checkbox" name="isDone" defaultChecked={item.isDone} className="w-4 h-4" />
          erledigt
        </label>
      )}
      <button className="btn-icon" type="submit"><Check size={14} /></button>
      <button className="btn-icon" type="button" onClick={onCancel}><X size={14} /></button>
    </form>
  );
}

export function TagManager({
  tags,
  createAction,
  deleteAction,
}: {
  tags: { id: string; label: string; color: string }[];
  createAction: (fd: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#9F877F");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    const fd = new FormData();
    fd.set("label", label);
    fd.set("color", color);
    await createAction(fd);
    setLabel("");
    toast.success("Tag angelegt");
    router.refresh();
  }
  async function onDel(id: string) {
    if (!confirm("Tag löschen?")) return;
    await deleteAction(id);
    router.refresh();
  }

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="font-serif text-xl">Tags</div>
        <div className="text-xs text-smoke mt-0.5">{`Frei wählbare Schlagwörter — z.B. „VIP", „Empfehlung", „Akt"`}</div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tags.map((t) => (
          <span key={t.id} className="badge group inline-flex items-center" style={{ background: `${t.color}15`, color: t.color, paddingRight: 6 }}>
            <span className="badge-dot" style={{ background: t.color }} />
            {t.label}
            <button onClick={() => onDel(t.id)} className="ml-1.5 opacity-50 hover:opacity-100">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <form onSubmit={onCreate} className="hairline pt-4 flex items-center gap-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 rounded-lg border border-stone bg-paper cursor-pointer" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Neues Tag…" className="input flex-1" />
        <button className="btn-primary"><Plus size={14} /></button>
      </form>
    </div>
  );
}
