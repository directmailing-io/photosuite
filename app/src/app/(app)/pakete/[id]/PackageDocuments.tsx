"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload, Trash2, Pencil, X, Save, Eye, EyeOff, ExternalLink, FileImage, File as FileIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import {
  createPackageDocument,
  updatePackageDocument,
  deletePackageDocument,
} from "../documentActions";

export type DocumentRow = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isVisible: boolean;
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MimeIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage size={14} className="text-accent" />;
  if (mime === "application/pdf") return <FileText size={14} className="text-accent" />;
  return <FileIcon size={14} className="text-accent" />;
}

export function PackageDocuments({
  packageId,
  documents,
}: {
  packageId: string;
  documents: DocumentRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section className="card">
      <div className="px-5 py-4 border-b border-stone/60 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow eyebrow-muted">Paket-Dokumente</div>
          <p className="text-xs text-smoke mt-1 max-w-2xl">
            Lade z.B. einen Prep Guide, Outfit Guide oder eine Anfahrtsbeschreibung hoch.
            Sichtbare Dokumente erscheinen für die Kundin im Self-Service-Bereich („Meine Buchung").
          </p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-primary text-xs h-9">
            <Upload size={13} /> Dokument hochladen
          </button>
        )}
      </div>

      {adding && (
        <div className="px-5 py-4 bg-linen/40 border-b border-stone/60">
          <UploadForm
            packageId={packageId}
            onCancel={() => setAdding(false)}
            onSaved={() => setAdding(false)}
          />
        </div>
      )}

      {documents.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-smoke italic">
          Noch keine Dokumente. Beginne z.B. mit dem „Prep Guide" als PDF.
        </div>
      ) : (
        <ul className="divide-y divide-stone/60">
          {documents.map((d) => (
            <li key={d.id}>
              {editingId === d.id ? (
                <div className="px-5 py-4 bg-linen/40">
                  <EditForm
                    doc={d}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <DocRow doc={d} onEdit={() => setEditingId(d.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocRow({ doc, onEdit }: { doc: DocumentRow; onEdit: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`„${doc.title}" löschen? Die Datei wird damit auch für Kundinnen unzugänglich.`)) return;
    startTransition(async () => {
      try {
        await deletePackageDocument(doc.id);
        toast.success("Dokument gelöscht");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht löschen");
      }
    });
  }

  return (
    <div className="px-5 py-3 flex items-start gap-3" style={{ opacity: doc.isVisible ? 1 : 0.55 }}>
      <div className="mt-1"><MimeIcon mime={doc.mimeType} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-sm">{doc.title}</div>
          {!doc.isVisible && (
            <span className="badge" style={{ background: "rgb(var(--linen))", color: "rgb(var(--smoke))" }}>
              <EyeOff size={10} className="inline mr-1" /> versteckt
            </span>
          )}
        </div>
        {doc.description && (
          <div className="text-xs text-smoke mt-0.5">{doc.description}</div>
        )}
        <div className="text-xs text-smoke mt-0.5">
          {doc.filename} · {fmtSize(doc.sizeBytes)}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noopener"
          className="btn-icon"
          title="Vorschau"
        >
          <ExternalLink size={13} />
        </a>
        <button onClick={onEdit} className="btn-icon" title="Bearbeiten">
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="btn-icon"
          style={{ color: "rgb(var(--accent))" }}
          title="Löschen"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function UploadForm({
  packageId,
  onCancel,
  onSaved,
}: {
  packageId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!picked) {
      toast.error("Bitte zuerst eine Datei wählen.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createPackageDocument(packageId, fd);
        toast.success("Dokument hochgeladen");
        router.refresh();
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Konnte nicht hochladen");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Datei *" hint="PDF, Bild, Word oder Text · max. 20 MB">
        <input
          ref={fileRef}
          type="file"
          name="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.doc,.txt,application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setPicked(e.currentTarget.files?.[0] ?? null)}
          className="text-sm"
        />
      </Field>
      <FormRow>
        <Field label="Titel" hint="Standard: Dateiname ohne Endung">
          <input
            name="title"
            maxLength={200}
            defaultValue={picked ? picked.name.replace(/\.[^.]+$/, "") : ""}
            className="input"
            placeholder='z.B. "Prep Guide" oder "Outfit-Inspiration"'
          />
        </Field>
      </FormRow>
      <Field label="Beschreibung" hint="Optional — 1-2 Zeilen Kontext für die Kundin.">
        <textarea
          name="description"
          rows={2}
          maxLength={1000}
          className="textarea text-sm"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isVisible" defaultChecked className="w-4 h-4" />
        <span>Für Kundinnen sichtbar im Self-Service-Bereich</span>
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost text-sm">
          <X size={13} /> Abbrechen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Upload size={13} /> {pending ? "Lädt hoch…" : "Hochladen"}
        </button>
      </div>
    </form>
  );
}

function EditForm({
  doc,
  onCancel,
  onSaved,
}: {
  doc: DocumentRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updatePackageDocument(doc.id, fd);
        toast.success("Dokument aktualisiert");
        router.refresh();
        onSaved();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Titel">
        <input name="title" defaultValue={doc.title} required maxLength={200} className="input" />
      </Field>
      <Field label="Beschreibung">
        <textarea
          name="description"
          defaultValue={doc.description ?? ""}
          rows={2}
          maxLength={1000}
          className="textarea text-sm"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isVisible" defaultChecked={doc.isVisible} className="w-4 h-4" />
        <span>Für Kundinnen sichtbar</span>
      </label>
      <div className="text-xs text-smoke">
        Datei selbst kann nicht ersetzt werden — bei Bedarf das Dokument löschen und neu hochladen.
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-stone/60">
        <button type="button" onClick={onCancel} disabled={pending} className="btn-ghost text-sm">
          <X size={13} /> Abbrechen
        </button>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={13} /> {pending ? "Speichern…" : "Aktualisieren"}
        </button>
      </div>
    </form>
  );
}
