import { redirect } from "next/navigation";

/**
 * /buchhaltung wurde in /finanzen integriert (Lisa wollte alles unter einem
 * Dach: KPIs + Rechnungs-Liste + Auswertungen). Die Detail-Routen
 * /buchhaltung/[id], /buchhaltung/neu, /buchhaltung/[id]/storno bleiben
 * funktional — nur die Liste-Übersicht wird umgeleitet, damit bestehende
 * Bookmarks/Links nicht ins Leere laufen.
 */
export default async function BuchhaltungPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const target = qs.toString() ? `/finanzen?${qs.toString()}` : "/finanzen";
  redirect(target);
}
