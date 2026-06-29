"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sliders, X, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { setDashboardWidgets } from "@/lib/dashboardActions";
import {
  WIDGET_DEFS,
  MAX_WIDGETS,
  MIN_WIDGETS,
  type WidgetKey,
} from "@/lib/dashboardWidgets";

/**
 * Drawer-basierter Widget-Picker. User wählt 1-4 KPI-Bausteine fürs Dashboard.
 *
 * Sicherheit: Server validiert nochmal gegen Whitelist + Cap.
 * UX: Live-Counter "X/4 ausgewählt", deaktiviert weitere Auswahl bei MAX,
 * Speichern-Button nur enabled bei Veränderung.
 */
export function DashboardWidgetPicker({ initial }: { initial: WidgetKey[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<WidgetKey[]>(initial);
  const [pending, startTransition] = useTransition();

  const hasChanged =
    selection.length !== initial.length ||
    selection.some((k, i) => k !== initial[i]);
  const isValid = selection.length >= MIN_WIDGETS && selection.length <= MAX_WIDGETS;

  function toggle(key: WidgetKey) {
    setSelection((cur) => {
      if (cur.includes(key)) {
        return cur.filter((k) => k !== key);
      }
      if (cur.length >= MAX_WIDGETS) {
        toast(`Maximal ${MAX_WIDGETS} Widgets — entferne erst eines.`);
        return cur;
      }
      return [...cur, key];
    });
  }

  function onSave() {
    if (!isValid || !hasChanged) return;
    startTransition(async () => {
      try {
        await setDashboardWidgets(selection);
        toast.success("Dashboard angepasst");
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        toast.error(e?.message ?? "Konnte nicht speichern");
      }
    });
  }

  function onCancel() {
    setSelection(initial);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-ghost h-8 text-xs gap-1.5"
        title="Dashboard-Widgets anpassen"
      >
        <Sliders size={13} />
        Anpassen
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onCancel}
          />
          <aside
            className="ml-auto relative h-full shadow-lg flex flex-col"
            style={{ width: "min(440px, 100vw)", background: "rgb(var(--bg))" }}
          >
            <header className="px-6 py-5 border-b border-stone/60 flex items-start justify-between gap-3 shrink-0">
              <div>
                <div className="eyebrow eyebrow-muted">Dashboard</div>
                <h2 className="font-serif text-2xl mt-1 leading-tight">Widgets anpassen</h2>
                <p className="text-xs text-smoke mt-1 max-w-sm">
                  Wähle bis zu {MAX_WIDGETS} KPI-Bausteine, die oben auf deinem Dashboard erscheinen sollen.
                </p>
              </div>
              <button onClick={onCancel} className="btn-icon" title="Schließen" disabled={pending}>
                <X size={15} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {groupBy(WIDGET_DEFS, (w) => w.group).map(([group, items]) => (
                <section key={group} className="mb-6 last:mb-0">
                  <div className="eyebrow eyebrow-muted mb-3">{group}</div>
                  <ul className="space-y-2">
                    {items.map((w) => {
                      const checked = selection.includes(w.key);
                      const disabled = !checked && selection.length >= MAX_WIDGETS;
                      return (
                        <li key={w.key}>
                          <button
                            type="button"
                            onClick={() => toggle(w.key)}
                            disabled={disabled}
                            className="w-full text-left p-3 rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              borderColor: checked ? "rgb(var(--accent))" : "rgb(var(--stone))",
                              background: checked ? "rgb(var(--accent-soft))" : "rgb(var(--paper))",
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5"
                                style={{
                                  borderColor: checked ? "rgb(var(--accent))" : "rgb(var(--stone))",
                                  background: checked ? "rgb(var(--accent))" : "transparent",
                                }}
                              >
                                {checked && (
                                  <Check size={12} strokeWidth={3} style={{ color: "rgb(var(--accent-on))" }} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm" style={{ color: "rgb(var(--ink))" }}>
                                  {w.label}
                                </div>
                                <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgb(var(--taupe))" }}>
                                  {w.description}
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <footer
              className="border-t border-stone/60 px-6 py-4 flex items-center justify-between gap-3 shrink-0"
              style={{ background: "rgb(var(--paper))" }}
            >
              <div className="text-xs flex items-center gap-1.5" style={{ color: "rgb(var(--taupe))" }}>
                {!isValid ? (
                  <>
                    <AlertCircle size={13} style={{ color: "rgb(var(--accent))" }} />
                    <span style={{ color: "rgb(var(--accent))" }}>
                      Mindestens {MIN_WIDGETS}, höchstens {MAX_WIDGETS} Widgets.
                    </span>
                  </>
                ) : (
                  <span>
                    {selection.length} von {MAX_WIDGETS} ausgewählt
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onCancel} className="btn-secondary h-9 text-xs" disabled={pending}>
                  Abbrechen
                </button>
                <button
                  onClick={onSave}
                  className="btn-accent h-9 text-xs"
                  disabled={pending || !isValid || !hasChanged}
                >
                  {pending ? "Speichert…" : "Speichern"}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

function groupBy<T, K extends string>(
  arr: ReadonlyArray<T>,
  fn: (item: T) => K,
): Array<[K, T[]]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const key = fn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries());
}
