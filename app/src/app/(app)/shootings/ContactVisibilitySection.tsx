"use client";

import { useState } from "react";
import { Link as LinkIcon, ChevronDown, ChevronRight } from "lucide-react";

/**
 * Kontakt-Sichtbarkeits-Sektion pro Shooting. Default: Studio-Settings gelten.
 * Wenn Override aktiv, werden die einzelnen Toggles freigeschaltet — Lisa kann
 * pro Shooting bestimmen, welche Kontaktdaten der Kundin angezeigt werden.
 */
export function ContactVisibilitySection({ initial }: {
  initial: {
    contactOverride: boolean;
    showPhoneOverride: boolean;
    showEmailOverride: boolean;
    showWebsiteOverride: boolean;
    showAddressOverride: boolean;
    showInstagramOverride: boolean;
    showWhatsappOverride: boolean;
    showTelegramOverride: boolean;
  };
}) {
  const [override, setOverride] = useState(initial.contactOverride);

  const items: Array<{ key: keyof typeof initial; label: string }> = [
    { key: "showPhoneOverride",     label: "Telefon" },
    { key: "showEmailOverride",     label: "E-Mail" },
    { key: "showWebsiteOverride",   label: "Website" },
    { key: "showAddressOverride",   label: "Adresse" },
    { key: "showInstagramOverride", label: "Instagram" },
    { key: "showWhatsappOverride",  label: "WhatsApp" },
    { key: "showTelegramOverride",  label: "Telegram" },
  ];

  return (
    <section className="card p-6">
      <div className="eyebrow eyebrow-muted mb-4 flex items-center gap-2">
        <LinkIcon size={13} /> Kontaktdaten auf der Kundenansicht
      </div>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          name="contactOverride"
          checked={override}
          onChange={(e) => setOverride(e.target.checked)}
          className="mt-0.5 w-4 h-4"
        />
        <div>
          <div className="font-medium">Für dieses Shooting eigene Sichtbarkeit festlegen</div>
          <div className="text-xs text-smoke mt-0.5">
            Wenn deaktiviert: deine Studio-Defaults aus Einstellungen → Studio-Profil gelten.
            Wenn aktiviert: die Auswahl unten überschreibt das nur für diese Kundin.
          </div>
        </div>
      </label>

      {override && (
        <div className="mt-4 pt-4 border-t border-stone/60">
          <div className="text-xs text-smoke mb-3">
            Welche Kontaktdaten soll diese Kundin in ihrer Ansicht sehen?
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer rounded px-3 py-2 hover:bg-linen transition">
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={initial[key] as boolean}
                  className="w-4 h-4"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
