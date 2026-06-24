import { prisma } from "@/lib/prisma";
import { buildICS } from "@/lib/ical";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const dateId = url.searchParams.get("date");

  // Public-Route: publicSlug ist composite-unique mit ownerId. Random-Token ist
  // krypto-eindeutig → findFirst ist sicher.
  const shooting = await prisma.shooting.findFirst({
    where: { publicSlug: slug },
    include: {
      customer: true,
      dates: { orderBy: { startAt: "asc" } },
    },
  });
  if (!shooting) return new Response("Not found", { status: 404 });

  const dates = dateId
    ? shooting.dates.filter((d) => d.id === dateId)
    : shooting.dates;

  if (dates.length === 0) {
    return new Response("Keine Termine", { status: 404 });
  }

  const ics = buildICS(
    dates.map((d) => ({
      uid: `${d.id}@lisa-crm`,
      summary: `${d.label} · ${shooting.title}`,
      description: d.description,
      location: d.location,
      start: d.startAt,
      end: d.endAt,
    })),
    `${shooting.title} – ${shooting.customer.firstName}`,
  );

  const filename = dateId
    ? `${slug}-${dateId}.ics`
    : `${slug}.ics`;

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
