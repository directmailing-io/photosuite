"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check, X, RefreshCw, Trash2, AlertCircle, ChevronRight, Plus, ShieldCheck,
  Eye, EyeOff, Lock, Sparkles, ListFilter,
} from "lucide-react";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/form/Field";
import {
  GoogleLogo, MicrosoftLogo, AppleLogo, NextcloudLogo,
  MailboxOrgLogo, PosteoLogo, CalDAVGenericLogo,
} from "@/components/ProviderLogos";
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from "@/lib/calendar/providers";
import {
  connectCalDAV, syncCalendarNow, disconnectCalendar, togglePseudonymize,
  listAvailableCalendars, saveSelectedCalendars,
} from "./calendarActions";

type Connection = {
  id: string;
  provider: string;
  status: string;
  accountEmail: string | null;
  externalCalendarName: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  pseudonymize: boolean;
};

export function CalendarSettings({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [wizardFor, setWizardFor] = useState<ProviderId | null>(null);

  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const connected = wizardFor ? null : connections.length > 0;

  // Erfolg-/Fehler-Hinweise nach OAuth-Redirect
  const flashConnected = params.get("connected");
  const flashError = params.get("error");

  return (
    <div className="space-y-6">
      {flashConnected && (
        <div className="card p-4 flex items-center gap-3" style={{ background: "rgb(var(--success-soft))", borderLeftWidth: 3, borderLeftColor: "rgb(var(--success))" }}>
          <Check size={18} style={{ color: "rgb(var(--success))" }} />
          <div className="text-sm">
            <div className="font-medium" style={{ color: "rgb(var(--success-deep))" }}>
              {PROVIDERS[flashConnected as ProviderId]?.label ?? flashConnected} verbunden
            </div>
            <div className="text-smoke text-xs mt-0.5">
              Termine werden ab jetzt synchronisiert. Du kannst gleich „Jetzt synchronisieren" klicken.
            </div>
          </div>
        </div>
      )}
      {flashError && (
        <div className="card p-4 flex items-center gap-3" style={{ background: "rgb(var(--accent-soft))", borderLeftWidth: 3, borderLeftColor: "rgb(var(--accent))" }}>
          <AlertCircle size={18} className="text-accent" />
          <div className="text-sm">
            <div className="font-medium">Verbindung abgebrochen</div>
            <div className="text-smoke text-xs mt-0.5">{decodeURIComponent(flashError)}</div>
          </div>
        </div>
      )}

      {/* Bereits verbunden */}
      {connections.length > 0 && (
        <section>
          <div className="eyebrow eyebrow-muted mb-3">Verbunden</div>
          <div className="space-y-3">
            {connections.map((c) => (
              <ConnectedRow key={c.id} connection={c} />
            ))}
          </div>
        </section>
      )}

      {/* Provider-Auswahl */}
      <section>
        <div className="eyebrow eyebrow-muted mb-3">
          {connections.length > 0 ? "Weiteren Kalender verbinden" : "Kalender verbinden"}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDER_ORDER.map((pid) => {
            const cfg = PROVIDERS[pid];
            const conn = byProvider.get(pid);
            return (
              <ProviderTile
                key={pid}
                providerId={pid}
                alreadyConnected={!!conn}
                onPick={() => {
                  if (cfg.kind === "oauth") {
                    if (pid === "google") {
                      window.location.href = "/api/calendar/google/connect";
                    } else {
                      toast(`${cfg.label} kommt bald.`);
                    }
                  } else {
                    setWizardFor(pid);
                  }
                }}
              />
            );
          })}
        </div>
      </section>

      {/* Datenschutz-Hinweis */}
      <section className="card p-5 bg-linen/40 text-sm space-y-2">
        <div className="eyebrow eyebrow-muted flex items-center gap-2">
          <ShieldCheck size={13} /> Datenschutz
        </div>
        <p className="text-smoke leading-relaxed">
          Wir speichern aus externen Kalendern <strong>nur Zeitfenster</strong> für die Konflikterkennung —
          keine Teilnehmer, keine Beschreibungen, keine Orte. Alle Zugangsdaten werden vor der Speicherung
          AES-256-verschlüsselt und können jederzeit per „Verbindung trennen" entfernt werden.
        </p>
        <p className="text-smoke leading-relaxed">
          Wenn du Kundinnen-Namen nicht in den externen Kalender pushen willst, aktiviere
          „Pseudonymisierung" — dann erscheinen deine Shootings dort als <em>„Termin #1234"</em>.
        </p>
      </section>

      {wizardFor && (
        <CalDAVWizard
          providerId={wizardFor}
          onClose={() => setWizardFor(null)}
          onConnected={() => {
            setWizardFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ProviderTile({
  providerId, alreadyConnected, onPick,
}: { providerId: ProviderId; alreadyConnected: boolean; onPick: () => void }) {
  const cfg = PROVIDERS[providerId];
  const Logo = LOGO_MAP[providerId];
  const disabled = !cfg.enabled || alreadyConnected;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="card p-4 flex items-center gap-4 text-left transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-paper shrink-0" style={{ border: "1px solid rgb(var(--stone))" }}>
        <Logo />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{cfg.label}</div>
        <div className="text-xs text-smoke mt-0.5 truncate">{cfg.description}</div>
      </div>
      {alreadyConnected ? (
        <Check size={16} style={{ color: "rgb(var(--success))" }} />
      ) : !cfg.enabled ? (
        <span className="text-[10px] uppercase tracking-wider text-smoke">bald</span>
      ) : (
        <ChevronRight size={16} className="text-smoke" />
      )}
    </button>
  );
}

const LOGO_MAP: Record<ProviderId, React.ComponentType> = {
  google: () => <GoogleLogo size={24} />,
  microsoft: () => <MicrosoftLogo size={22} />,
  apple: () => <AppleLogo size={22} color="rgb(var(--ink))" />,
  nextcloud: () => <NextcloudLogo size={32} />,
  mailbox: () => <MailboxOrgLogo size={22} />,
  posteo: () => <PosteoLogo size={22} />,
  caldav_custom: () => <CalDAVGenericLogo size={22} />,
};

function ConnectedRow({ connection }: { connection: Connection }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const cfg = PROVIDERS[connection.provider as ProviderId];
  const Logo = LOGO_MAP[connection.provider as ProviderId] ?? CalDAVGenericLogo;

  function onSync() {
    startTransition(async () => {
      const res = await syncCalendarNow(connection.id);
      if (res.ok) {
        const parts = [`${res.applied} importiert`];
        if (res.deleted > 0) parts.push(`${res.deleted} entfernt`);
        if (res.pushed > 0) parts.push(`${res.pushed} Shootings hochgeladen`);
        toast.success(`Synchronisiert · ${parts.join(", ")}`);
      } else toast.error(res.error);
      router.refresh();
    });
  }
  function onDisconnect() {
    if (!confirm(`${cfg?.label ?? connection.provider} wirklich trennen?`)) return;
    startTransition(async () => {
      await disconnectCalendar(connection.id);
      toast.success("Verbindung getrennt");
      router.refresh();
    });
  }
  function onTogglePseudonymize() {
    startTransition(async () => {
      await togglePseudonymize(connection.id);
      router.refresh();
    });
  }

  const lastSync = connection.lastSyncedAt
    ? new Date(connection.lastSyncedAt).toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "noch nie";

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-paper shrink-0" style={{ border: "1px solid rgb(var(--stone))" }}>
          <Logo />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium">{cfg?.label ?? connection.provider}</div>
            {connection.status === "active" ? (
              <span className="badge" style={{ background: "rgb(var(--success-soft))", color: "rgb(var(--success-deep))" }}>
                <Check size={10} /> Aktiv
              </span>
            ) : (
              <span className="badge" style={{ background: "rgb(var(--accent-soft))", color: "rgb(var(--accent-deep))" }}>
                <AlertCircle size={10} /> Fehler
              </span>
            )}
          </div>
          <div className="text-xs text-smoke mt-0.5 truncate">
            {connection.accountEmail}
            {connection.externalCalendarName && ` · ${connection.externalCalendarName}`}
          </div>
          <div className="text-[11px] text-smoke mt-1">
            Letzter Sync: {lastSync}
            {connection.lastSyncError && (
              <span className="text-accent ml-1.5">· {connection.lastSyncError}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button onClick={onSync} disabled={pending} className="btn-secondary text-xs h-8">
            <RefreshCw size={11} className={pending ? "animate-spin" : ""} />
            Sync
          </button>
          {connection.provider === "google" && (
            <button onClick={() => setPickerOpen(true)} disabled={pending} className="btn-ghost text-xs h-8">
              <ListFilter size={11} /> Kalender
            </button>
          )}
          <button onClick={onDisconnect} disabled={pending} className="btn-ghost text-xs h-8" style={{ color: "rgb(var(--accent))" }}>
            <Trash2 size={11} /> Trennen
          </button>
        </div>
      </div>

      <div className="border-t border-stone/60 mt-3 pt-3 flex items-center gap-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer" title='Wenn aktiv, erscheinen exportierte Termine als "Termin #1234" statt mit Kundinnen-Name'>
          <input
            type="checkbox"
            checked={connection.pseudonymize}
            onChange={onTogglePseudonymize}
            disabled={pending}
            className="w-3.5 h-3.5"
          />
          <Sparkles size={11} className="text-taupe" />
          <span className="text-smoke">Pseudonymisierung — Kundinnen-Namen nicht in Google/Apple übertragen</span>
        </label>
      </div>

      {pickerOpen && (
        <CalendarPickerModal
          connectionId={connection.id}
          onClose={() => setPickerOpen(false)}
          onSaved={() => { setPickerOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CalendarPickerModal({
  connectionId, onClose, onSaved,
}: {
  connectionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string; primary: boolean; timeZone: string | null; color: string | null; accessRole: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pushTargetId, setPushTargetId] = useState<string>("");
  const [needsReauth, setNeedsReauth] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await listAvailableCalendars(connectionId);
      if (!res.ok) {
        toast.error(res.error);
        if (res.needsReauth) setNeedsReauth(true);
        setLoading(false);
        return;
      }
      setCalendars(res.calendars);
      const initialSelected = res.selectedIds.length > 0 ? res.selectedIds : res.calendars.filter((c) => c.primary).map((c) => c.id);
      setSelectedIds(new Set(initialSelected));
      setPushTargetId(res.pushTargetId ?? res.calendars.find((c) => c.primary)?.id ?? res.calendars[0]?.id ?? "");
      setLoading(false);
    })();
  }, [connectionId]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Push-Target muss in der Auswahl bleiben
    if (pushTargetId === id && selectedIds.has(id)) {
      const remaining = [...selectedIds].filter((x) => x !== id);
      if (remaining.length > 0) setPushTargetId(remaining[0]);
    }
  }

  function onSave() {
    if (selectedIds.size === 0) {
      toast.error("Mindestens einen Kalender auswählen");
      return;
    }
    const selected = calendars
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({ id: c.id, summary: c.summary, color: c.color, timezone: c.timeZone }));
    let target = pushTargetId;
    if (!selectedIds.has(target)) target = selected[0].id;
    startTransition(async () => {
      const res = await saveSelectedCalendars(connectionId, { selected, pushTargetId: target });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`${selected.length} Kalender gewählt — nächster Sync lädt sie neu`);
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-serif text-lg">Kalender auswählen</div>
              <div className="text-xs text-smoke mt-0.5">
                Welche Kalender sollen synchronisiert werden? Und in welchen sollen deine Shootings angelegt werden?
              </div>
            </div>
            <button onClick={onClose} className="btn-icon" disabled={pending} aria-label="Schließen">
              <X size={15} />
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-smoke py-8 text-center">Lade Kalender…</div>
          ) : needsReauth ? (
            <div className="card p-4 bg-linen text-sm space-y-3">
              <p>
                Für die Kalender-Auswahl benötigt die App eine zusätzliche Berechtigung. Bitte trenne Google
                kurz und verbinde es erneut — beim neuen OAuth-Flow werden die richtigen Scopes angefragt.
              </p>
              <a href="/api/calendar/google/connect" className="btn-primary text-sm">
                <RefreshCw size={13} /> Google neu verbinden
              </a>
            </div>
          ) : calendars.length === 0 ? (
            <div className="text-sm text-smoke py-6 text-center">Keine Kalender gefunden.</div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-wider text-smoke mb-1">
                {selectedIds.size} von {calendars.length} ausgewählt
              </div>
              <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {calendars.map((cal) => {
                  const checked = selectedIds.has(cal.id);
                  const isTarget = pushTargetId === cal.id;
                  return (
                    <li key={cal.id}>
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-stone hover:bg-linen/40">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(cal.id)}
                          className="w-4 h-4 shrink-0"
                        />
                        {cal.color && (
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ background: cal.color }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {cal.summary}
                            {cal.primary && <span className="text-[10px] text-smoke ml-1.5 uppercase tracking-wider">primär</span>}
                          </div>
                          <div className="text-[11px] text-smoke">
                            {cal.accessRole === "owner" ? "Vollzugriff" : cal.accessRole === "writer" ? "Schreibrechte" : "Nur lesen"}
                            {cal.timeZone && ` · ${cal.timeZone}`}
                          </div>
                        </div>
                        {checked && cal.accessRole !== "reader" && (
                          <label className="flex items-center gap-1.5 text-[11px] text-smoke shrink-0 cursor-pointer">
                            <input
                              type="radio"
                              name="pushTarget"
                              checked={isTarget}
                              onChange={() => setPushTargetId(cal.id)}
                              className="w-3.5 h-3.5"
                            />
                            Shootings hier
                          </label>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="callout-like text-xs text-smoke pt-1">
                <strong className="text-ink">Wie funktioniert das?</strong> Alle ausgewählten Kalender werden in
                deine Konflikt-Anzeige importiert. Im Kalender mit „Shootings hier" werden deine neu angelegten
                Shootings in Google sichtbar.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone/60">
                <button type="button" onClick={onClose} disabled={pending} className="btn-ghost text-sm">
                  Abbrechen
                </button>
                <button onClick={onSave} disabled={pending} className="btn-primary text-sm">
                  {pending ? "Speichern…" : "Auswahl speichern"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// CalDAV-Setup-Wizard
function CalDAVWizard({
  providerId, onClose, onConnected,
}: { providerId: ProviderId; onClose: () => void; onConnected: () => void }) {
  const cfg = PROVIDERS[providerId];
  const [serverUrl, setServerUrl] = useState(cfg.caldavUrl ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, startTransition] = useTransition();
  const [calendars, setCalendars] = useState<Array<{ url: string; displayName: string; timezone: string | null }> | null>(null);
  const [selectedCalendar, setSelectedCalendar] = useState<string>("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await connectCalDAV(providerId, {
        serverUrl: cfg.caldavUrl ?? serverUrl,
        username,
        password,
        selectedCalendarUrl: selectedCalendar || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.calendars && res.calendars.length > 1) {
        setCalendars(res.calendars);
        setSelectedCalendar(res.calendars[0].url);
        return;
      }
      toast.success(`${cfg.label} verbunden`);
      onConnected();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-paper" style={{ border: "1px solid rgb(var(--stone))" }}>
                {(() => { const L = LOGO_MAP[providerId]; return <L />; })()}
              </div>
              <div>
                <div className="font-serif text-lg">{cfg.label} verbinden</div>
                <div className="text-xs text-smoke">{cfg.description}</div>
              </div>
            </div>
            <button onClick={onClose} className="btn-icon" disabled={pending} aria-label="Schließen">
              <X size={15} />
            </button>
          </div>

          {/* Setup-Schritte */}
          {cfg.setupInstructions && !calendars && (
            <div className="bg-linen/40 rounded-xl p-4 text-sm">
              <div className="font-medium mb-2">So bereitest du dich vor:</div>
              <ol className="space-y-1.5 text-smoke list-decimal list-inside">
                {cfg.setupInstructions.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            </div>
          )}

          {calendars ? (
            <div className="space-y-3">
              <div className="text-sm">
                Mehrere Kalender gefunden — wähle den, der synchronisiert werden soll:
              </div>
              <ul className="space-y-2">
                {calendars.map((c) => (
                  <li key={c.url}>
                    <label className="flex items-center gap-3 p-3 border border-stone rounded-lg cursor-pointer hover:bg-linen/40">
                      <input
                        type="radio"
                        name="calendar"
                        value={c.url}
                        checked={selectedCalendar === c.url}
                        onChange={(e) => setSelectedCalendar(e.target.value)}
                      />
                      <div className="text-sm">{c.displayName}</div>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={async () => {
                  startTransition(async () => {
                    const res = await connectCalDAV(providerId, {
                      serverUrl: cfg.caldavUrl ?? serverUrl,
                      username,
                      password,
                      selectedCalendarUrl: selectedCalendar,
                    });
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success(`${cfg.label} verbunden`);
                    onConnected();
                  });
                }}
                disabled={pending}
                className="btn-primary w-full"
              >
                {pending ? "Verbinden…" : "Diesen Kalender verwenden"}
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {!cfg.caldavUrl && (
                <Field label="Server-URL" hint="z.B. https://cloud.example.com">
                  <input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    required
                    placeholder="https://…"
                    className="input"
                  />
                </Field>
              )}
              <Field label={cfg.emailHint ?? "Benutzername"}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="off"
                  className="input"
                />
              </Field>
              <Field
                label={cfg.passwordType === "app-specific" ? "App-spezifisches Passwort" : "Passwort"}
                hint={cfg.passwordType === "app-specific" ? "Aus deinem Anbieter-Account, nicht dein normales Login-Passwort" : undefined}
              >
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="input pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-smoke hover:text-ink"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
              <div className="text-xs text-smoke flex items-center gap-1.5">
                <Lock size={11} /> AES-256-GCM verschlüsselt, an deinen Account gebunden
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} disabled={pending} className="btn-ghost">
                  Abbrechen
                </button>
                <button type="submit" disabled={pending} className="btn-primary">
                  {pending ? "Verbinde…" : "Verbinden & Test"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
