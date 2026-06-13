"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Video, ExternalLink, Check, Info } from "lucide-react";
import { VIDEO_PROVIDER_ORDER, VIDEO_PROVIDERS, type VideoProviderKey } from "@/lib/videoProviders";
import { saveVideoLinks } from "./videoMeetingActions";

export type VideoLinks = {
  zoomPersonalLink: string | null;
  googleMeetPersonalLink: string | null;
  teamsPersonalLink: string | null;
  wherebyPersonalLink: string | null;
};

export function VideoMeetingSettings({ initial }: { initial: VideoLinks }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<VideoProviderKey, string>>(() => ({
    zoom: initial.zoomPersonalLink ?? "",
    google_meet: initial.googleMeetPersonalLink ?? "",
    teams: initial.teamsPersonalLink ?? "",
    whereby: initial.wherebyPersonalLink ?? "",
    manual: "",
  }));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("zoom", values.zoom);
    fd.set("google_meet", values.google_meet);
    fd.set("teams", values.teams);
    fd.set("whereby", values.whereby);
    startTransition(async () => {
      try {
        await saveVideoLinks(fd);
        toast.success("Meeting-Links gespeichert");
        router.refresh();
      } catch (err: any) {
        toast.error(err?.message ?? "Fehler");
      }
    });
  }

  const configured = VIDEO_PROVIDER_ORDER.filter((k) => k !== "manual").filter(
    (k) => values[k].trim().length > 0,
  );

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="px-6 py-4 border-b border-stone/60">
        <div className="eyebrow eyebrow-muted flex items-center gap-1.5">
          <Video size={11} /> Online-Meeting-Tools
        </div>
        <div className="text-sm text-smoke mt-1 max-w-2xl">
          Hinterlege deine persönlichen Meeting-Links. Bei Buchungen, die als „Online-Meeting"
          gebucht werden, schreibt das CRM den passenden Link automatisch in die Bestätigung
          an die Kundin.
        </div>
      </div>

      {/* Info-Banner: ehrlich kommunizieren was MVP ist */}
      <div
        className="px-6 py-3 text-xs flex items-start gap-2 border-b border-stone/60"
        style={{ background: "rgba(120, 167, 119, 0.06)", color: "var(--smoke)" }}
      >
        <Info size={12} className="shrink-0 mt-0.5" style={{ color: "rgb(70, 115, 70)" }} />
        <span>
          Aktuell: persönlicher, fester Meeting-Link pro Provider. Auto-Create-Meeting
          per OAuth (eigener Raum pro Buchung) folgt in einer späteren Iteration.
        </span>
      </div>

      <div className="px-6 py-5 space-y-3">
        {VIDEO_PROVIDER_ORDER.filter((k) => k !== "manual").map((key) => {
          const def = VIDEO_PROVIDERS[key];
          const hasValue = values[key].trim().length > 0;
          return (
            <div
              key={key}
              className="rounded-lg border p-4 transition-colors"
              style={{
                borderColor: hasValue ? def.brandColor : "var(--stone)",
                background: hasValue ? `${def.brandColor}08` : "var(--paper)",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-medium text-sm"
                  style={{
                    background: hasValue ? def.brandColor : "var(--linen)",
                    color: hasValue ? "#fff" : "var(--smoke)",
                  }}
                >
                  {def.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="font-medium text-sm">{def.name}</div>
                    {hasValue && (
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: def.brandColor }}>
                        <Check size={9} className="inline -mt-0.5" /> verbunden
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-smoke mt-0.5">{def.description}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="url"
                      value={values[key]}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={def.placeholderUrl}
                      className="input h-9 text-sm flex-1"
                    />
                    {hasValue && (
                      <a
                        href={values[key]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-icon"
                        title="Link öffnen / testen"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-stone/60 flex items-center justify-between">
        <div className="text-xs text-smoke">
          {configured.length === 0
            ? "Noch kein Link hinterlegt — Online-Buchungen ohne Auto-Link."
            : `${configured.length} ${configured.length === 1 ? "Tool" : "Tools"} verbunden`}
        </div>
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={13} /> {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
