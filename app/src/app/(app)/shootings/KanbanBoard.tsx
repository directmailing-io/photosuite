"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { moveShootingToStatus } from "./actions";
import { formatEUR, formatDateTime } from "@/lib/utils";
import { CalendarDays, MapPin } from "lucide-react";

type Status = { id: string; label: string; color: string; position: number };
type Card = {
  id: string;
  title: string;
  statusId: string | null;
  price: number;
  scheduledAt: string | null;
  location: string | null;
  customerName: string;
  customerAvatarUrl: string | null;
  packageName: string | null;
  kanbanPosition: number;
};

export function KanbanBoard({ statuses, shootings }: { statuses: Status[]; shootings: Card[] }) {
  const [items, setItems] = useState(shootings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const groups = useMemo(() => {
    const by: Record<string, Card[]> = {};
    statuses.forEach((s) => (by[s.id] = []));
    by["__unassigned__"] = [];
    items.forEach((c) => {
      const k = c.statusId && by[c.statusId] ? c.statusId : "__unassigned__";
      by[k].push(c);
    });
    Object.values(by).forEach((arr) => arr.sort((a, b) => a.kanbanPosition - b.kanbanPosition));
    return by;
  }, [items, statuses]);

  const cols = useMemo(() => {
    const arr = [...statuses];
    if (groups["__unassigned__"].length > 0) {
      arr.push({ id: "__unassigned__", label: "Ohne Status", color: "#9F877F", position: 999 });
    }
    return arr;
  }, [statuses, groups]);

  function findColumn(cardId: string): string | null {
    for (const colId of Object.keys(groups)) {
      if (groups[colId].some((c) => c.id === cardId)) return colId;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const fromCol = findColumn(activeIdStr);
    if (!fromCol) return;
    // overId can be column id or card id
    const toCol = statuses.find((s) => s.id === overIdStr)?.id
      ?? (overIdStr === "__unassigned__" ? "__unassigned__" : findColumn(overIdStr));
    if (!toCol) return;

    setItems((prev) => {
      const next = [...prev];
      const movingIdx = next.findIndex((c) => c.id === activeIdStr);
      if (movingIdx < 0) return prev;
      const moving = { ...next[movingIdx] };
      moving.statusId = toCol === "__unassigned__" ? null : toCol;

      // Remove
      next.splice(movingIdx, 1);
      // Determine insert position
      let insertAt: number;
      if (toCol === overIdStr) {
        // Dropped on column header / empty col: append to end of that group
        const groupItems = next.filter((c) => (c.statusId ?? "__unassigned__") === toCol);
        const lastIdx = groupItems.length ? next.indexOf(groupItems[groupItems.length - 1]) : -1;
        insertAt = lastIdx + 1;
      } else {
        // Dropped on a card
        const overIdx = next.findIndex((c) => c.id === overIdStr);
        insertAt = overIdx >= 0 ? overIdx : next.length;
      }
      next.splice(insertAt, 0, moving);

      // Renumber within target column
      const newPositions = next
        .filter((c) => (c.statusId ?? "__unassigned__") === toCol)
        .map((c, i) => ({ id: c.id, kanbanPosition: i }));
      const posMap = new Map(newPositions.map((p) => [p.id, p.kanbanPosition]));
      return next.map((c) => posMap.has(c.id) ? { ...c, kanbanPosition: posMap.get(c.id)! } : c);
    });

    startTransition(async () => {
      const updated = items.find((c) => c.id === activeIdStr);
      if (!updated) return;
      const targetStatus = toCol === "__unassigned__" ? null : toCol;
      // Use the new index in our local groups
      const newPos = (groups[toCol] ?? []).length;
      if (targetStatus) {
        await moveShootingToStatus(activeIdStr, targetStatus, newPos);
      }
    });
  }

  const activeCard = activeId ? items.find((c) => c.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 snap-x">
        {cols.map((col) => {
          const colItems = groups[col.id] ?? [];
          const sum = colItems.reduce((acc, c) => acc + c.price, 0);
          return (
            <KanbanColumn key={col.id} id={col.id} title={col.label} color={col.color} count={colItems.length} sum={sum}>
              <SortableContext items={colItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {colItems.map((card) => (
                  <KanbanCard key={card.id} card={card} />
                ))}
              </SortableContext>
              {colItems.length === 0 && (
                <div className="text-center text-xs text-smoke py-6">Leer</div>
              )}
            </KanbanColumn>
          );
        })}
      </div>
      <DragOverlay>
        {activeCard ? <KanbanCard card={activeCard} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  id, title, color, count, sum, children,
}: {
  id: string; title: string; color: string; count: number; sum: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="w-[300px] shrink-0 snap-start"
      style={{ minHeight: 200 }}
    >
      <div className="px-3 py-2 flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="badge-dot" style={{ background: color }} />
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-ink">{title}</div>
          <div className="text-xs text-smoke">{count}</div>
        </div>
        {sum > 0 && (
          <div className="text-xs text-smoke tabular-nums">{formatEUR(sum)}</div>
        )}
      </div>
      <div
        className="rounded-xl2 p-2 space-y-2 transition-colors"
        style={{ background: isOver ? "rgb(var(--linen))" : "rgba(236,235,232,0.4)", minHeight: 120 }}
      >
        {children}
      </div>
    </div>
  );
}

function KanbanCard({ card, dragging = false }: { card: Card; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="card p-3 cursor-grab active:cursor-grabbing select-none"
    >
      <Link href={`/shootings/${card.id}`} onClick={(e) => e.stopPropagation()} className="block">
        <div className="font-medium text-sm leading-snug">{card.title}</div>
        {card.packageName && (
          <div className="text-xs text-smoke mt-0.5">{card.packageName}</div>
        )}
        <div className="flex items-center gap-1.5 mt-3 text-xs">
          <Avatar firstName={card.customerName.split(" ")[0]} lastName={card.customerName.split(" ")[1]} url={card.customerAvatarUrl} size={20} />
          <span className="text-smoke truncate">{card.customerName}</span>
        </div>
        {(card.scheduledAt || card.location) && (
          <div className="text-xs text-smoke mt-2 space-y-0.5">
            {card.scheduledAt && (
              <div className="flex items-center gap-1.5"><CalendarDays size={11} /> {formatDateTime(card.scheduledAt)}</div>
            )}
            {card.location && (
              <div className="flex items-center gap-1.5"><MapPin size={11} /> {card.location}</div>
            )}
          </div>
        )}
        <div className="hairline mt-2 pt-2 flex justify-end text-xs tabular-nums font-medium">
          {formatEUR(card.price)}
        </div>
      </Link>
    </div>
  );
}
