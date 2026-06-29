"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { addAttachment, deleteAttachment } from "../actions";
import { Paperclip, Upload, Trash2, FileText, User as UserIcon, Camera, LayoutGrid } from "lucide-react";
import { toast } from "sonner";

type Att = {
  id: string;
  filename: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string;        // "STUDIO" oder "CUSTOMER"
  createdAt: string;         // ISO
};

function humanSize(b: number | null) {
  if (b == null) return "";
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function uploaderLabel(by: string): { label: string; Icon: typeof UserIcon } {
  if (by === "CUSTOMER") return { label: "Kundin", Icon: UserIcon };
  return { label: "Fotografin", Icon: Camera };
}

export function AttachmentManager({ shootingId, attachments }: { shootingId: string; attachments: Att[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  // Anzahl bildhafter Anhänge — bestimmt, ob der Moodboard-Button sinnvoll ist.
  const imageCount = attachments.filter((a) =>
    a.mimeType === "image/jpeg" || a.mimeType === "image/png" || a.mimeType === "image/webp"
  ).length;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    try {
      await addAttachment(shootingId, fd);
      toast.success("Datei hochgeladen");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload fehlgeschlagen");
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
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="eyebrow eyebrow-muted flex items-center gap-2"><Paperclip size={13} /> Dateien</div>
        <div className="flex items-center gap-1.5">
          {imageCount > 0 && (
            <a
              href={`/api/shootings/${shootingId}/moodboard`}
              target="_blank"
              rel="noopener"
              className="btn-ghost text-xs h-8"
              title={`Moodboard aus ${imageCount} Bildern als PDF`}
            >
              <LayoutGrid size={13} /> Moodboard-PDF
            </a>
          )}
          <input ref={fileInput} type="file" className="hidden" onChange={onFile} />
          <button onClick={() => fileInput.current?.click()} className="btn-secondary text-xs h-8">
            <Upload size={13} /> Hochladen
          </button>
        </div>
      </div>

      {attachments.length === 0 ? (
        <div className="text-sm text-smoke text-center py-4">Noch keine Dateien.</div>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => {
            const up = uploaderLabel(a.uploadedBy);
            const Icon = up.Icon;
            return (
              <li key={a.id} className="flex items-center gap-3 group p-2 rounded-lg hover:bg-linen">
                <FileText size={16} className="text-taupe shrink-0" />
                <div className="flex-1 min-w-0">
                  <a href={a.url} target="_blank" className="text-sm truncate hover:underline block">
                    {a.filename}
                  </a>
                  <div className="text-[11px] text-smoke flex items-center gap-2 mt-0.5">
                    <span>{formatUploadDate(a.createdAt)}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Icon size={10} />
                      Upload von {up.label}
                    </span>
                    {a.sizeBytes != null && (
                      <>
                        <span>·</span>
                        <span>{humanSize(a.sizeBytes)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => onDel(a.id)} className="btn-icon opacity-0 group-hover:opacity-100">
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
