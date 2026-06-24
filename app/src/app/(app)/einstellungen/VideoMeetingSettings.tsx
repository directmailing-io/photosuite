"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Video, ExternalLink, Check, Info, Zap, Link as LinkIcon, X, AlertTriangle } from "lucide-react";
import { VIDEO_PROVIDER_ORDER, VIDEO_PROVIDERS, type VideoProviderKey } from "@/lib/videoProviders";
import { ProviderLogo } from "@/components/icons/VideoProviderLogos";
import { saveVideoLinks } from "./videoMeetingActions";

export type VideoLinks = {
  zoomPersonalLink: string | null;
  googleMeetPersonalLink: string | null;
  teamsPersonalLink: string | null;
  wherebyPersonalLink: string | null;
  zoomConnected: boolean;
  zoomAccountEmail: string | null;
  googleConnected: boolean;
  googleAccountEmail: string | null;
};

// Provider, die OAuth-Auto-Create-Meeting unterstützen (Tier 2)
const OAUTH_PROVIDERS = new Set<VideoProviderKey>(["zoom", "google_meet"]);

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

  async function onDisconnect(provider: "zoom" | "google") {
    if (!confirm(`Verbindung mit ${provider === "zoom" ? "Zoom" : "Google"} wirklich trennen?`)) return;
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, { method: "POST" });
      if (!res.ok) throw new Error("Konnte nicht trennen");
      toast.success("Verbindung getrennt");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Fehler");
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="px-6 py-4 border-b border-stone/60">
        <div className="eyebrow eyebrow-muted flex items-center gap-1.5">
          <Video size={11} /> Online-Meeting-Tools
        </div>
        <div className="text-sm text-smoke mt-1 max-w-2xl">
          Verbinde Zoom oder Google Meet — dann wird pro Buchung automatisch ein eigener Meeting-Raum
          erstellt. Persönlicher Link bleibt als Fallback (z.B. wenn Account nicht verbunden ist).
        </div>
      </div>

      {/* Info-Banner */}
      <div
        className="px-6 py-3 text-xs flex items-start gap-2 border-b border-stone/60"
        style={{ background: "rgba(120, 167, 119, 0.06)", color: "rgb(var(--smoke))" }}
      >
        <Info size={12} className="shrink-0 mt-0.5" style={{ color: "rgb(70, 115, 70)" }} />
        <div>
          <strong style={{ color: "rgb(var(--ink))" }}>Zoom & Google Meet:</strong> Vollwertige OAuth-Verbindung — eigener Raum pro Buchung.{" "}
          <br />
          <strong style={{ color: "rgb(var(--ink))" }}>Microsoft Teams & Whereby:</strong> persönlicher Link (du gibst einen festen Raum an, der in jede Buchung eingefügt wird).
        </div>
      </div>

      <div className="px-6 py-5 space-y-3">
        {VIDEO_PROVIDER_ORDER.filter((k) => k !== "manual").map((key) => {
          const def = VIDEO_PROVIDERS[key];
          const hasPersonalLink = values[key].trim().length > 0;
          const isOAuthProvider = OAUTH_PROVIDERS.has(key);
          const isOAuthConnected =
            (key === "zoom" && initial.zoomConnected) ||
            (key === "google_meet" && initial.googleConnected);
          const oauthEmail =
            key === "zoom" ? initial.zoomAccountEmail :
            key === "google_meet" ? initial.googleAccountEmail :
            null;
          const isActive = isOAuthConnected || hasPersonalLink;

          return (
            <div
              key={key}
              className="rounded-lg border p-4 transition-colors"
              style={{
                borderColor: isActive ? def.brandColor : "rgb(var(--stone))",
                background: isActive ? `${def.brandColor}08` : "rgb(var(--paper))",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  style={{
                    background: isActive ? "rgb(var(--paper))" : "rgb(var(--linen))",
                    border: `1px solid ${isActive ? def.brandColor + "60" : "rgb(var(--stone))"}`,
                  }}
                >
                  <ProviderLogo provider={key} size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="font-medium text-sm">{def.name}</div>
                    {isOAuthConnected && (
                      <span className="text-[10px] uppercase tracking-wider inline-flex items-center gap-0.5" style={{ color: def.brandColor }}>
                        <Zap size={9} /> verbunden
                      </span>
                    )}
                    {!isOAuthConnected && hasPersonalLink && (
                      <span className="text-[10px] uppercase tracking-wider inline-flex items-center gap-0.5" style={{ color: def.brandColor }}>
                        <LinkIcon size={9} /> Fallback-Link
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-smoke mt-0.5">{def.description}</div>

                  {/* OAuth-Block — nur für Zoom + Google Meet */}
                  {isOAuthProvider && (
                    <div
                      className="mt-3 rounded-md border p-3"
                      style={{
                        borderColor: isOAuthConnected ? def.brandColor + "60" : "rgb(var(--stone))",
                        background: isOAuthConnected ? `${def.brandColor}10` : "rgba(0,0,0,0.02)",
                      }}
                    >
                      <div className="flex items-start gap-2 flex-wrap">
                        <Zap size={13} className="shrink-0 mt-0.5" style={{ color: def.brandColor }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium">Auto-Meeting pro Buchung</div>
                          <div className="text-[11px] text-smoke mt-0.5">
                            {isOAuthConnected ? (
                              <>Verbunden als <strong style={{ color: "rgb(var(--ink))" }}>{oauthEmail ?? "(unbekannt)"}</strong></>
                            ) : (
                              <>Verbinde dein {def.name}-Konto, damit pro Buchung ein eigener Raum entsteht.</>
                            )}
                          </div>
                        </div>
                        {isOAuthConnected ? (
                          <button
                            type="button"
                            onClick={() => onDisconnect(key === "zoom" ? "zoom" : "google")}
                            className="btn-ghost text-xs h-8"
                            style={{ color: "rgb(var(--accent))" }}
                          >
                            <X size={11} /> Trennen
                          </button>
                        ) : (
                          <a
                            href={`/api/integrations/${key === "zoom" ? "zoom" : "google"}/connect`}
                            className="text-xs h-8 px-3 inline-flex items-center gap-1.5 rounded-md font-medium transition-colors"
                            style={{
                              background: def.brandColor,
                              color: "#fff",
                            }}
                          >
                            <Zap size={11} /> Mit {def.name} verbinden
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fallback-Link-Block */}
                  <div className="mt-3">
                    <label className="text-[10px] uppercase tracking-wider text-smoke flex items-center gap-1.5 mb-1">
                      <LinkIcon size={9} /> Persönlicher Link
                      {isOAuthProvider && (
                        <span className="text-[9px] normal-case tracking-normal opacity-70">
                          (Fallback, wenn nicht verbunden)
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={values[key]}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        placeholder={def.placeholderUrl}
                        className="input h-9 text-sm flex-1"
                      />
                      {hasPersonalLink && (
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
            </div>
          );
        })}
      </div>

      {/* ENV-Setup-Hinweis */}
      <details className="px-6 py-3 border-t border-stone/60 text-xs">
        <summary className="cursor-pointer text-smoke hover:text-ink flex items-center gap-1.5">
          <AlertTriangle size={11} /> OAuth funktioniert nicht? Setup-Anleitung
        </summary>
        <div className="mt-3 space-y-2 text-smoke">
          <div>
            Vor dem ersten „Verbinden"-Klick brauchst du Developer-Credentials in <code>.env</code>:
          </div>
          <pre className="bg-linen p-2 rounded text-[10px] overflow-x-auto" style={{ color: "rgb(var(--ink))" }}>
{`# Zoom (https://marketplace.zoom.us → Build App → OAuth)
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_REDIRECT_URL=http://localhost:3006/api/integrations/zoom/callback

# Google Meet (https://console.cloud.google.com → APIs → Calendar)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URL=http://localhost:3006/api/integrations/google/callback`}
          </pre>
          <div>
            Nach dem Eintragen Dev-Server neu starten und „Mit Zoom/Google verbinden" klicken.
          </div>
        </div>
      </details>

      <div className="px-6 py-4 border-t border-stone/60 flex items-center justify-end">
        <button type="submit" disabled={pending} className="btn-primary text-sm">
          <Save size={13} /> {pending ? "Speichern…" : "Persönliche Links speichern"}
        </button>
      </div>
    </form>
  );
}
