"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";
import { Star, Check } from "lucide-react";

export type TeamPickerMember = {
  id: string;
  firstName: string;
  lastName: string;
  role: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
};

type Props = {
  members: TeamPickerMember[];
  initialPrimaryId?: string | null;
  initialMemberIds?: string[];
  // Eingabewerte für Server Actions:
  primaryFieldName?: string;   // default: primaryContactId
  membersFieldName?: string;   // default: teamIds
};

export function TeamPicker({
  members,
  initialPrimaryId,
  initialMemberIds = [],
  primaryFieldName = "primaryContactId",
  membersFieldName = "teamIds",
}: Props) {
  const [primaryId, setPrimaryId] = useState<string | null>(initialPrimaryId ?? null);
  const [selected, setSelected] = useState<string[]>(initialMemberIds);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        // wenn das der Primary war, dann auch zurücksetzen
        if (primaryId === id) setPrimaryId(null);
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

  function setPrim(id: string) {
    setPrimaryId(id);
    if (!selected.includes(id)) setSelected((prev) => [...prev, id]);
  }

  return (
    <div>
      {/* Hidden inputs für Form-Submit */}
      <input type="hidden" name={primaryFieldName} value={primaryId ?? ""} />
      {selected.map((id) => (
        <input key={id} type="hidden" name={membersFieldName} value={id} />
      ))}

      <div className="space-y-2">
        {members.map((m) => {
          const active = selected.includes(m.id);
          const isPrimary = primaryId === m.id;
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 p-2.5 rounded-lg border transition"
              style={{
                background: active ? "rgb(var(--paper))" : "transparent",
                borderColor: active ? (isPrimary ? "rgb(var(--accent))" : "rgb(var(--stone))") : "transparent",
                boxShadow: isPrimary ? "0 0 0 2px rgba(200,16,46,0.12)" : "none",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className="flex items-center gap-3 flex-1 text-left"
              >
                <div className="relative">
                  <Avatar url={m.avatarUrl} firstName={m.firstName} lastName={m.lastName} size={36} />
                  {active && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-ink flex items-center justify-center">
                      <Check size={9} className="text-bg" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink flex items-center gap-1.5 truncate">
                    {m.firstName} {m.lastName}
                    {m.isOwner && <Star size={11} className="text-accent fill-accent shrink-0" />}
                  </div>
                  {m.role && <div className="text-xs text-smoke truncate">{m.role}</div>}
                </div>
              </button>

              {active && (
                <button
                  type="button"
                  onClick={() => setPrim(m.id)}
                  className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded transition hover:opacity-90"
                  style={{
                    // Aktiv-Primary: roter „Solid"-Button. Inaktiv-Primary:
                    // hellgrauer Pill mit dunklem Text, damit er auf der
                    // hellen Card klar lesbar bleibt (nicht weiß auf weiß).
                    background: isPrimary ? "rgb(var(--accent))" : "rgb(var(--linen))",
                    color: isPrimary ? "#fff" : "rgb(var(--ink))",
                    border: isPrimary ? "none" : "1px solid rgb(var(--stone))",
                    fontWeight: 500,
                  }}
                  title={isPrimary ? "Ist Ansprechpartner:in" : "Als Ansprechpartner:in setzen"}
                >
                  <Star size={11} className={isPrimary ? "fill-current" : ""} />
                  Ansprechpartner
                </button>
              )}
            </div>
          );
        })}
      </div>
      {members.length === 0 && (
        <div className="text-sm text-smoke text-center py-4">Noch keine Team-Mitglieder. Lege welche unter „Team" an.</div>
      )}
    </div>
  );
}
