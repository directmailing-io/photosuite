import { notFound } from "next/navigation";
import { loadFormById } from "@/lib/leadForm/load";
import { LeadFormRender } from "@/lib/leadForm/render";

export const dynamic = "force-dynamic";

/**
 * Embed-Render eines LeadForm. Bewusst ohne Header/Footer/Branding —
 * wird in einen iframe auf Lisa's Kunden-Websites eingebettet. Die Höhe
 * wird via postMessage an die Parent-Page kommuniziert (s. LeadFormRender).
 */
export default async function EmbedFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const form = await loadFormById(id);
  if (!form) return notFound();
  return <LeadFormRender form={form} isEmbed />;
}
