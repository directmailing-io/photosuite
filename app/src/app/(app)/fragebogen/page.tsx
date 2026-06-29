import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import {
  FileQuestion, CheckCircle2, Eye, Send, Pencil, Inbox,
  ChevronRight, Sparkles,
} from "lucide-react";
import { STATUS_LABELS, type StatusKey } from "@/lib/questionnaire";
import { formatDateTime, relativeDate, cn } from "@/lib/utils";
import { FragebogenTabs } from "./FragebogenTabs";

export const dynamic = "force-dynamic";

type FilterKey = "ALL" | "NEW" | "OPEN" | "SUBMITTED" | "DRAFT";

export default async function FragebogenPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = (sp.filter as FilterKey) ?? "ALL";
  const userId = await requireUserId();

  const all = await prisma.questionnaire.findMany({
    where: { shooting: { ownerId: userId } },
    include: {
      shooting: { include: { customer: true } },
      _count: { select: { fields: true, answers: true } },
    },
    orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
  });

  const counts = {
    ALL: all.length,
    NEW: all.filter((q) => q.status === "SUBMITTED" && (!q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt))).length,
    OPEN: all.filter((q) => q.status === "OPENED" || q.status === "IN_PROGRESS" || q.status === "SENT").length,
    SUBMITTED: all.filter((q) => q.status === "SUBMITTED").length,
    DRAFT: all.filter((q) => q.status === "DRAFT").length,
  };

  const filtered = all.filter((q) => {
    if (filter === "ALL") return true;
    if (filter === "NEW") return q.status === "SUBMITTED" && (!q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt));
    if (filter === "OPEN") return q.status === "OPENED" || q.status === "IN_PROGRESS" || q.status === "SENT";
    if (filter === "SUBMITTED") return q.status === "SUBMITTED";
    if (filter === "DRAFT") return q.status === "DRAFT";
    return true;
  });

  // Group submitted-new at top, then by status
  const sortRank = (q: typeof all[number]) => {
    const isNew = q.status === "SUBMITTED" && (!q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt));
    if (isNew) return 0;
    if (q.status === "SUBMITTED") return 1;
    if (q.status === "IN_PROGRESS") return 2;
    if (q.status === "OPENED") return 3;
    if (q.status === "SENT") return 4;
    return 5;
  };
  const sorted = [...filtered].sort((a, b) => {
    const r = sortRank(a) - sortRank(b);
    if (r !== 0) return r;
    const aT = (a.submittedAt ?? a.updatedAt).getTime();
    const bT = (b.submittedAt ?? b.updatedAt).getTime();
    return bT - aT;
  });

  return (
    <>
      <PageHeader
        eyebrow="Briefings & Antworten"
        title="Fragebögen"
        subtitle="Alle Fragebögen aller Shootings auf einen Blick — wer hat geöffnet, wer hat abgeschickt."
      />

      <FragebogenTabs active="antworten" />

      {/* Status-Counts als Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <FilterChip current={filter} value="ALL" label="Alle" count={counts.ALL} />
        <FilterChip current={filter} value="NEW" label="Neue Antworten" count={counts.NEW} accent />
        <FilterChip current={filter} value="OPEN" label="In Bearbeitung" count={counts.OPEN} />
        <FilterChip current={filter} value="SUBMITTED" label="Abgeschickt" count={counts.SUBMITTED} />
        <FilterChip current={filter} value="DRAFT" label="Entwurf" count={counts.DRAFT} />
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<FileQuestion size={36} strokeWidth={1.25} />}
          title={filter === "ALL" ? "Noch keine Fragebögen" : "Nichts in dieser Auswahl"}
          description={
            filter === "ALL"
              ? "Lege Fragebögen direkt am Shooting an. Du kannst Briefings, Vorabchecks oder Feedback-Runden abfragen."
              : "Schalte oben einen anderen Filter ein, um andere Bögen zu sehen."
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <ul>
            {sorted.map((q) => {
              const meta = STATUS_LABELS[q.status as StatusKey] ?? STATUS_LABELS.DRAFT;
              const isNew = q.status === "SUBMITTED" && (!q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt));
              const c = q.shooting.customer;
              const progress = q._count.fields > 0 ? Math.round((q._count.answers / q._count.fields) * 100) : 0;
              return (
                <li key={q.id} className="border-t border-stone/60 first:border-0">
                  <Link
                    href={`/shootings/${q.shooting.id}/fragebogen/${q.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-linen/50 transition"
                  >
                    {/* New-Indicator Strip */}
                    <span
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ background: isNew ? "rgb(var(--accent))" : "transparent" }}
                    />
                    <Avatar url={c.avatarUrl} firstName={c.firstName} lastName={c.lastName} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium text-sm">{q.title}</div>
                        {isNew && (
                          <span className="badge" style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-on))", border: "none" }}>
                            <Sparkles size={10} /> Neu
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-smoke mt-0.5 flex items-center gap-2">
                        <span>{c.firstName} {c.lastName}</span>
                        <span>·</span>
                        <span>{q.shooting.title}</span>
                      </div>
                      {q.status !== "DRAFT" && q._count.fields > 0 && (
                        <div className="mt-2 flex items-center gap-2 max-w-xs">
                          <div className="flex-1 h-1 rounded-full bg-linen overflow-hidden">
                            <div
                              className="h-full"
                              style={{
                                background: q.status === "SUBMITTED" ? "rgb(var(--ink))" : "rgb(var(--accent))",
                                width: `${progress}%`,
                              }}
                            />
                          </div>
                          <div className="text-[10px] text-smoke tabular-nums">{q._count.answers}/{q._count.fields}</div>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className="badge"
                        style={{ background: `${meta.color}15`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <div className="text-[11px] text-smoke mt-1.5">
                        {q.status === "SUBMITTED" && q.submittedAt && `abgeschickt ${relativeDate(q.submittedAt)}`}
                        {q.status === "IN_PROGRESS" && q.lastSavedAt && `aktiv vor ${relativeDate(q.lastSavedAt)}`}
                        {q.status === "OPENED" && q.openedAt && `geöffnet ${relativeDate(q.openedAt)}`}
                        {q.status === "SENT" && q.sentAt && `versendet ${relativeDate(q.sentAt)}`}
                        {q.status === "DRAFT" && `bearbeitet ${relativeDate(q.updatedAt)}`}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-smoke shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function FilterChip({
  current,
  value,
  label,
  count,
  accent,
}: {
  current: string;
  value: string;
  label: string;
  count: number;
  accent?: boolean;
}) {
  const active = current === value;
  return (
    <Link
      href={`/fragebogen${value === "ALL" ? "" : `?filter=${value}`}`}
      className="badge transition"
      style={{
        background: active ? "rgb(var(--ink))" : accent && count > 0 ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
        color: active ? "rgb(var(--bg))" : accent && count > 0 ? "rgb(var(--accent-deep))" : "rgb(var(--smoke))",
        border: active ? "none" : "1px solid rgb(var(--stone))",
        padding: "6px 12px",
      }}
    >
      {label}
      <span className="tabular-nums" style={{ opacity: 0.7 }}>{count}</span>
    </Link>
  );
}
