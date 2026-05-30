import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { Plus, UsersRound, Star, Mail, Phone } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const members = await prisma.teamMember.findMany({
    orderBy: [{ isOwner: "desc" }, { position: "asc" }, { firstName: "asc" }],
    include: { expertise: true, _count: { select: { shootingsPrimary: true, shootingsMembers: true } } },
  });

  return (
    <>
      <PageHeader
        eyebrow="Wer steht vor und hinter der Kamera"
        title="Team"
        subtitle="Standardmäßig nur du. Lade Kolleg:innen, Assistenz oder Make-up dazu — und wähle pro Shooting, wer dabei ist."
      >
        <Link href="/team/neu" className="btn-accent">
          <Plus size={16} /> Mitglied hinzufügen
        </Link>
      </PageHeader>

      {members.length === 0 ? (
        <EmptyState
          icon={<UsersRound size={36} strokeWidth={1.25} />}
          title="Noch keine Team-Mitglieder"
          description="Sieht aus, als hätte das Seed noch nicht gelaufen."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {members.map((m) => (
            <Link
              key={m.id}
              href={`/team/${m.id}`}
              className="card card-hover p-5 flex flex-col"
            >
              <div className="flex items-start gap-4">
                <Avatar url={m.avatarUrl} firstName={m.firstName} lastName={m.lastName} size={56} />
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-xl flex items-center gap-2">
                    {m.firstName} {m.lastName}
                    {m.isOwner && <Star size={13} className="text-accent fill-accent" />}
                  </div>
                  {m.role && <div className="text-xs text-smoke mt-0.5">{m.role}</div>}
                </div>
              </div>

              {m.bio && (
                <div className="text-sm text-ink/80 mt-4 line-clamp-2 leading-relaxed">{m.bio}</div>
              )}

              {m.expertise.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {m.expertise.map((e) => (
                    <span key={e.id} className="badge" style={{ background: `${e.color}15`, color: e.color }}>
                      {e.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="hairline mt-4 pt-3 flex items-center justify-between text-xs text-smoke">
                <div className="flex gap-3">
                  {m.email && <span className="flex items-center gap-1"><Mail size={11} /> E-Mail</span>}
                  {m.phone && <span className="flex items-center gap-1"><Phone size={11} /> Telefon</span>}
                </div>
                <div className="tabular-nums">
                  {m._count.shootingsPrimary + m._count.shootingsMembers} Shootings
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
