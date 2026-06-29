"use client";

import { Printer } from "lucide-react";

/**
 * Öffnet eine dedizierte, gebrandete Print-Page für die Checkliste in einem
 * neuen Tab. Dort wird der Druckdialog automatisch ausgelöst.
 *
 * Vorteil gegenüber dem alten `window.print()`-Hack: kein CSS-Hide-Tricksen,
 * sondern eine echte schlanke A4-Vorlage mit Studio-Logo und sauberem Layout.
 */
export function PrintChecklistButton({ slug }: { slug: string }) {
  return (
    <a
      href={`/k/${slug}/checkliste/print`}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-secondary text-xs h-9"
      title="Als PDF speichern oder drucken"
    >
      <Printer size={13} /> Drucken / PDF
    </a>
  );
}
