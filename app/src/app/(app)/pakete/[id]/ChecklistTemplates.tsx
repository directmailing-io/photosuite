"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ListChecks, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  addChecklistTemplate,
  deleteChecklistTemplate,
  renameChecklistTemplate,
  addChecklistTemplateItem,
  deleteChecklistTemplateItem,
  setTemplateAudience,
} from "../actions";

type Item = { id: string; label: string };
type Template = { id: string; title: string; audience: string; items: Item[] };

export function ChecklistTemplates({
  packageId,
  templates,
}: {
  packageId: string;
  templates: Template[];
}) {
  const router = useRouter();
  const [newListTitle, setNewListTitle] = useState("");
  const [newListAudience, setNewListAudience] = useState<"INTERNAL" | "CUSTOMER">("INTERNAL");
  const [editing, setEditing] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newListTitle.trim()) return;
    const fd = new FormData();
    fd.set("title", newListTitle);
    fd.set("audience", newListAudience);
    await addChecklistTemplate(packageId, fd);
    setNewListTitle("");
    toast.success("Liste angelegt");
    router.refresh();
  }
  async function onDelList(id: string) {
    if (!confirm("Liste löschen?")) return;
    await deleteChecklistTemplate(id, packageId);
    router.refresh();
  }
  async function onRename(id: string, fd: FormData) {
    await renameChecklistTemplate(id, packageId, fd);
    setEditing(null);
    router.refresh();
  }
  async function onToggleAudience(id: string, current: string) {
    const next = current === "CUSTOMER" ? "INTERNAL" : "CUSTOMER";
    await setTemplateAudience(id, next, packageId);
    router.refresh();
  }

  const internal = templates.filter((t) => t.audience === "INTERNAL");
  const customer = templates.filter((t) => t.audience === "CUSTOMER");

  return (
    <div className="card p-6 space-y-6">
      <div>
        <div className="eyebrow eyebrow-muted flex items-center gap-2"><ListChecks size={13} /> Checklisten-Vorlagen</div>
        <div className="text-xs text-smoke mt-1">
          Werden bei jedem neuen Shooting mit diesem Paket automatisch angelegt.
          <strong className="text-ink"> Interne</strong> Listen siehst nur du,
          <strong className="text-ink"> Kunden-Listen</strong> erscheinen zusätzlich auf der Kundenansicht.
        </div>
      </div>

      <Section
        title="Kundenliste"
        subtitle="Sieht auch deine Kundin auf der Landing-Page"
        icon={<Eye size={13} />}
        accent
        templates={customer}
        packageId={packageId}
        editing={editing}
        setEditing={setEditing}
        onRename={onRename}
        onDel={onDelList}
        onToggleAudience={onToggleAudience}
      />

      <Section
        title="Interne Liste"
        subtitle="Nur für dich und dein Team"
        icon={<EyeOff size={13} />}
        templates={internal}
        packageId={packageId}
        editing={editing}
        setEditing={setEditing}
        onRename={onRename}
        onDel={onDelList}
        onToggleAudience={onToggleAudience}
      />

      <form onSubmit={onAdd} className="hairline pt-5 flex gap-2 items-center">
        <select
          value={newListAudience}
          onChange={(e) => setNewListAudience(e.target.value as any)}
          className="select w-40"
        >
          <option value="INTERNAL">Intern</option>
          <option value="CUSTOMER">Für Kundin</option>
        </select>
        <input
          value={newListTitle}
          onChange={(e) => setNewListTitle(e.target.value)}
          placeholder={`Neue Checkliste — z.B. „Was die Kundin mitbringt"`}
          className="input flex-1"
        />
        <button className="btn-primary"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function Section({
  title, subtitle, icon, accent, templates, packageId,
  editing, setEditing, onRename, onDel, onToggleAudience,
}: any) {
  if (templates.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="badge" style={{ background: accent ? "rgb(var(--accent-soft))" : "rgb(var(--linen))", color: accent ? "rgb(var(--accent-deep))" : "rgb(var(--smoke))" }}>
            {icon} {title}
          </span>
          <span className="text-xs text-smoke">{subtitle}</span>
        </div>
        <div className="text-xs text-smoke italic ml-1">Noch keine Listen.</div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="badge" style={{ background: accent ? "rgb(var(--accent-soft))" : "rgb(var(--linen))", color: accent ? "rgb(var(--accent-deep))" : "rgb(var(--smoke))" }}>
          {icon} {title}
        </span>
        <span className="text-xs text-smoke">{subtitle}</span>
      </div>
      {templates.map((tpl: Template) => (
        <TemplateBlock
          key={tpl.id}
          tpl={tpl}
          packageId={packageId}
          editing={editing}
          setEditing={setEditing}
          onRename={onRename}
          onDel={onDel}
          onToggleAudience={onToggleAudience}
        />
      ))}
    </div>
  );
}

function TemplateBlock({
  tpl, packageId, editing, setEditing, onRename, onDel, onToggleAudience,
}: any) {
  return (
    <div className="ml-1">
      <div className="flex items-center justify-between mb-2 group">
        {editing === tpl.id ? (
          <form onSubmit={(e) => { e.preventDefault(); onRename(tpl.id, new FormData(e.currentTarget)); }} className="flex gap-1 flex-1">
            <input name="title" defaultValue={tpl.title} autoFocus className="input h-8 text-sm" />
            <button className="btn-icon" type="submit"><Check size={13} /></button>
            <button className="btn-icon" type="button" onClick={() => setEditing(null)}><X size={13} /></button>
          </form>
        ) : (
          <>
            <div className="font-medium text-sm">{tpl.title}</div>
            <div className="opacity-0 group-hover:opacity-100 flex">
              <button onClick={() => onToggleAudience(tpl.id, tpl.audience)} className="btn-icon" title="Sichtbarkeit umschalten">
                {tpl.audience === "CUSTOMER" ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button onClick={() => setEditing(tpl.id)} className="btn-icon"><Pencil size={13} /></button>
              <button onClick={() => onDel(tpl.id)} className="btn-icon"><Trash2 size={13} /></button>
            </div>
          </>
        )}
      </div>
      <ul className="space-y-1">
        {tpl.items.map((it: Item) => (
          <ItemRow key={it.id} item={it} packageId={packageId} />
        ))}
      </ul>
      <AddItemRow templateId={tpl.id} packageId={packageId} />
    </div>
  );
}

function ItemRow({ item, packageId }: { item: Item; packageId: string }) {
  const router = useRouter();
  async function onDel() {
    await deleteChecklistTemplateItem(item.id, packageId);
    router.refresh();
  }
  return (
    <li className="flex items-center gap-2 group">
      <span className="w-3.5 h-3.5 rounded-sm border border-stone shrink-0" />
      <span className="text-sm text-ink flex-1">{item.label}</span>
      <button onClick={onDel} className="btn-icon opacity-0 group-hover:opacity-100">
        <Trash2 size={12} />
      </button>
    </li>
  );
}

function AddItemRow({ templateId, packageId }: { templateId: string; packageId: string }) {
  const router = useRouter();
  const [v, setV] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.trim()) return;
    const fd = new FormData();
    fd.set("label", v);
    await addChecklistTemplateItem(templateId, packageId, fd);
    setV("");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex gap-2 mt-2 ml-1">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Punkt hinzufügen…" className="input h-9 text-sm flex-1" />
      <button className="btn-ghost h-9 px-2"><Plus size={14} /></button>
    </form>
  );
}
