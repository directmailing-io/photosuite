import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProfileEditForm } from "./ProfileEditForm";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Customer-Self-Service-Profil.
 * Auth: Slug genügt (siehe actions.ts für Security-Modell).
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shooting = await prisma.shooting.findFirst({
    where: { publicSlug: slug },
    include: { customer: true },
  });
  if (!shooting) return notFound();
  const c = shooting.customer;

  return (
    <div className="min-h-screen bg-bg py-12">
      <div className="max-w-2xl mx-auto px-6">
        <Link
          href={`/k/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-smoke hover:text-ink transition mb-6"
        >
          <ChevronLeft size={14} /> Zurück zur Übersicht
        </Link>

        <div className="mb-8">
          <div className="eyebrow eyebrow-muted">Dein Profil</div>
          <h1 className="font-serif text-4xl mt-2">Hi {c.firstName}, schön dich zu sehen.</h1>
          <p className="text-sm text-smoke mt-3 max-w-xl leading-relaxed">
            Hier kannst du deine Kontakt- und Adressdaten aktualisieren — z.B. wenn du
            umgezogen bist oder eine andere Lieferadresse für Fotoprodukte hast.
            Alles, was du hier änderst, bekommt Lisa direkt mit.
          </p>
        </div>

        <ProfileEditForm
          slug={slug}
          initial={{
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            phone: c.phone,
            birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : "",
            avatarUrl: c.avatarUrl,
            billingStreet: c.billingStreet,
            billingZip: c.billingZip,
            billingCity: c.billingCity,
            billingCountry: c.billingCountry,
            welcomeStreet: c.welcomeStreet,
            welcomeZip: c.welcomeZip,
            welcomeCity: c.welcomeCity,
            welcomeCountry: c.welcomeCountry,
            welcomeNote: c.welcomeNote,
            deliveryStreet: c.deliveryStreet,
            deliveryZip: c.deliveryZip,
            deliveryCity: c.deliveryCity,
            deliveryCountry: c.deliveryCountry,
            deliveryNote: c.deliveryNote,
          }}
        />
      </div>
    </div>
  );
}
