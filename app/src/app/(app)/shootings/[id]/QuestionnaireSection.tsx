"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, FileQuestion, Send, Clock, CheckCircle2, Eye, FilePlus2, BookOpenCheck,
} from "lucide-react";
import { toast } from "sonner";
import { createQuestionnaire, createQuestionnaireFromTemplate } from "./questionnaireActions";
import { STATUS_LABELS, type StatusKey } from "@/lib/questionnaire";
import { relativeDate } from "@/lib/utils";

type QSummary = {
  id: string;
  title: string;
  status: string;
  fieldCount: number;
  answeredCount: number;
  sentAt: string | null;
  openedAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
};

type Template = {
  id: string;
  title: string;
  fieldCount: number;
};

export function QuestionnaireSection({
  shootingId,
  questionnaires,
  templates,
  publicSlug,
}: {
  shootingId: string;
  questionnaires: QSummary[];
  templates: Template[];
  publicSlug: string | null;
}) {
  const router = useRouter();
  const [picker, setPicker] = useState<"closed" | "template" | "empty">("closed");
  const [emptyTitle, setEmptyTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreateEmpty(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData();
    fd.set("title", emptyTitle || "Neuer Fragebogen");
    try { await createQuestionnaire(shootingId, fd); } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error("Konnte nicht anlegen");
      setBusy(false);
    }
  }

  async function onCreateFromTemplate(templateId: string) {
    setBusy(true);
    try {
      await createQuestionnaireFromTemplate(shootingId, templateId);
    } catch (err: any) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) return;
      toast.error("Konnte nicht anlegen");
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="eyebrow eyebrow-muted flex items-center gap-2">
          <FileQuestion size={13} /> Fragebögen
        </div>
        {picker === "closed" && (
          <button onClick={() => setPicker(templates.length > 0 ? "template" : "empty")} className="btn-secondary text-xs h-8">
            <Plus size={13} /> Neuer Bogen
          </button>
        )}
      </div>

      {picker === "template" && (
        <div className="card p-3 mb-4 bg-linen/40">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <BookOpenCheck size={12} /> Aus Vorlage erstellen
            </div>
            <button type="button" onClick={() => setPicker("closed")} className="btn-ghost h-7 px-2 text-xs">
              Abbrechen
            </button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onCreateFromTemplate(t.id)}
                disabled={busy}
                className="w-full p-2.5 rounded-lg border text-left hover:bg-paper transition flex items-center gap-3"
                style={{ borderColor: "var(--stone)" }}
              >
                <FileQuestion size={15} className="text-taupe shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-smoke">{t.fieldCount} {t.fieldCount === 1 ? "Frage" : "Fragen"}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="hairline mt-3 pt-3">
            <button
              onClick={() => setPicker("empty")}
              className="text-xs text-smoke hover:text-ink flex items-center gap-1 w-full justify-center py-1"
            >
              <FilePlus2 size={12} /> Oder leeren Bogen anlegen
            </button>
          </div>
          <div className="text-xs text-smoke mt-3 text-center">
            Neue Vorlagen unter{" "}
            <Link href="/fragebogen/vorlagen" className="underline hover:text-ink">Fragebögen → Vorlagen</Link>
          </div>
        </div>
      )}

      {picker === "empty" && (
        <form onSubmit={onCreateEmpty} className="card p-3 mb-4 bg-linen/40 flex gap-2 items-center">
          <input
            value={emptyTitle}
            onChange={(e) => setEmptyTitle(e.target.value)}
            placeholder={`Titel — z.B. „Briefing"`}
            autoFocus
            className="input h-9 text-sm flex-1"
          />
          <button disabled={busy} className="btn-primary h-9 px-3 text-xs">Anlegen</button>
          <button type="button" onClick={() => setPicker(templates.length > 0 ? "template" : "closed")} className="btn-ghost h-9 px-2 text-xs">Abbrechen</button>
        </form>
      )}

      {questionnaires.length === 0 && picker === "closed" && (
        <div className="text-sm text-smoke text-center py-6">
          Keine Fragebögen. Nutze {templates.length > 0 ? "eine Vorlage" : "einen leeren Bogen"} — Mood, Outfits, Anfahrt strukturiert abfragen.
        </div>
      )}

      <ul className="space-y-2">
        {questionnaires.map((q) => {
          const meta = STATUS_LABELS[q.status as StatusKey] ?? STATUS_LABELS.DRAFT;
          const progress = q.fieldCount > 0 ? Math.round((q.answeredCount / q.fieldCount) * 100) : 0;
          return (
            <li key={q.id}>
              <Link
                href={`/shootings/${shootingId}/fragebogen/${q.id}`}
                className="card card-hover p-4 block"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{q.title}</div>
                    <div className="text-xs text-smoke mt-1 flex flex-wrap gap-3">
                      <span>{q.fieldCount} {q.fieldCount === 1 ? "Frage" : "Fragen"}</span>
                      {q.status === "SUBMITTED" && q.submittedAt && (
                        <span className="flex items-center gap-1" style={{ color: "var(--ink)" }}>
                          <CheckCircle2 size={11} /> {relativeDate(q.submittedAt)}
                        </span>
                      )}
                      {q.status !== "SUBMITTED" && q.openedAt && (
                        <span className="flex items-center gap-1"><Eye size={11} /> geöffnet {relativeDate(q.openedAt)}</span>
                      )}
                      {q.status !== "SUBMITTED" && q.sentAt && !q.openedAt && (
                        <span className="flex items-center gap-1"><Send size={11} /> versendet {relativeDate(q.sentAt)}</span>
                      )}
                    </div>
                  </div>
                  <span
                    className="badge shrink-0"
                    style={{ background: `${meta.color}15`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                {q.status !== "DRAFT" && q.fieldCount > 0 && (
                  <div className="mt-3">
                    <div className="h-1 rounded-full bg-linen overflow-hidden">
                      <div className="h-full transition-all" style={{
                        background: q.status === "SUBMITTED" ? "var(--ink)" : "var(--accent)",
                        width: `${progress}%`,
                      }} />
                    </div>
                    <div className="text-[10px] text-smoke mt-1 tabular-nums">{q.answeredCount}/{q.fieldCount} beantwortet</div>
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
