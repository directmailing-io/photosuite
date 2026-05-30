"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { addAttachment, deleteAttachment } from "../actions";
import { Paperclip, Upload, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

type Att = { id: string; filename: string; url: string; sizeBytes: number | null };

function humanSize(b: number | null) {
  if (b == null) return "";
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function AttachmentManager({ shootingId, attachments }: { shootingId: string; attachments: Att[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    try {
      await addAttachment(shootingId, fd);
      toast.success("Datei hochgeladen");
      router.refresh();
    } catch {
      toast.error("Upload fehlgeschlagen");
    } finally {
      e.target.value = "";
    }
  }

  async function onDel(id: string) {
    if (!confirm("Anhang löschen?")) return;
    await deleteAttachment(id, shootingId);
    router.refresh();
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow eyebrow-muted flex items-center gap-2"><Paperclip size={13} /> Dateien</div>
        <input ref={fileInput} type="file" className="hidden" onChange={onFile} />
        <button onClick={() => fileInput.current?.click()} className="btn-secondary text-xs h-8">
          <Upload size={13} /> Hochladen
        </button>
      </div>

      {attachments.length === 0 ? (
        <div className="text-sm text-smoke text-center py-4">Noch keine Dateien.</div>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 group p-2 rounded-lg hover:bg-linen">
              <FileText size={16} className="text-taupe shrink-0" />
              <a href={a.url} target="_blank" className="text-sm flex-1 truncate hover:underline">{a.filename}</a>
              <div className="text-xs text-smoke">{humanSize(a.sizeBytes)}</div>
              <button onClick={() => onDel(a.id)} className="btn-icon opacity-0 group-hover:opacity-100">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
