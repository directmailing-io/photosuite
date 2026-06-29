"use client";

import { Printer } from "lucide-react";

/**
 * Druckt die Checkliste über den Browser-eigenen Print-Dialog.
 * Im Print-Dialog kann die Kundin „Als PDF speichern" wählen.
 *
 * Funktioniert über global definierte print-only CSS-Regeln (siehe globals.css):
 * - die Section mit `.print-only` bleibt sichtbar
 * - alles andere wird via `@media print` ausgeblendet
 *
 * Vorteil gegenüber server-side PDF-Generation: kein zusätzlicher Endpoint,
 * kein Hosting-Cost, perfekte Schrift- + Farb-Wiedergabe via Browser-Engine.
 */
export function PrintChecklistButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-secondary text-xs h-9 print-hide"
      title="Als PDF speichern oder drucken"
    >
      <Printer size={13} /> Drucken / PDF
    </button>
  );
}
