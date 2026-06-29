"use client";

import { useEffect } from "react";

/**
 * Triggert den Browser-Druckdialog automatisch nach dem Mount.
 * Kurze Verzögerung, damit Logos/Fonts vor dem Snapshot geladen sind.
 */
export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);
  return null;
}
