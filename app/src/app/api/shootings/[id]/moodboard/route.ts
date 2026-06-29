import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderMoodboardPdf, type MoodboardImage } from "@/lib/moodboardPdf";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 24;
// Akzeptierte MIME-Types — react-pdf rendert PNG/JPG zuverlässig.
// SVG wäre theoretisch möglich, in Komposition aber unzuverlässig (skipped).
const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const url = new URL(_req.url);
  // ?source=customer | studio | all (default)
  const source = url.searchParams.get("source") ?? "all";

  const shooting = await prisma.shooting.findFirst({
    where: { id, ownerId: userId },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      owner: { select: { studioName: true, name: true } },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!shooting) return new Response("Not found", { status: 404 });

  // Filter: nur Bilder + (optional) Quelle. Bei Source-Filter werden Non-Image
  // Anhänge automatisch raus, weil mimeType-Check vorher greift.
  const candidates = shooting.attachments.filter((a) => {
    if (!a.mimeType || !IMAGE_MIME.includes(a.mimeType)) return false;
    if (source === "customer" && a.uploadedBy !== "CUSTOMER") return false;
    if (source === "studio" && a.uploadedBy !== "STUDIO") return false;
    return true;
  });
  const images: MoodboardImage[] = candidates.slice(0, MAX_IMAGES).map((a) => ({
    // Absolute URL bauen — react-pdf braucht http(s)-URLs zum Embedden.
    url: a.url.startsWith("http") ? a.url : `${process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? ""}${a.url}`,
    filename: a.filename,
  }));

  const studioName = shooting.owner.studioName ?? shooting.owner.name;

  const stream = await renderMoodboardPdf({
    shootingTitle: shooting.title,
    customerName: `${shooting.customer.firstName} ${shooting.customer.lastName}`,
    studioName,
    images,
  });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    (stream as any).on("data", (c: Buffer) => chunks.push(c));
    (stream as any).on("end", () => resolve());
    (stream as any).on("error", reject);
  });
  const buf = Buffer.concat(chunks);

  const safeTitle = shooting.title.replace(/[^a-zA-Z0-9_\- ]+/g, "").slice(0, 60) || "Shooting";
  const filename = `Moodboard-${safeTitle}.pdf`;

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
