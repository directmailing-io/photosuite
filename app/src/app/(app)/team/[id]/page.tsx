import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { TeamForm } from "../TeamForm";
import { updateTeamMember, deleteTeamMember } from "../actions";

export default async function EditMember({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const [member, expertise] = await Promise.all([
    prisma.teamMember.findFirst({ where: { id, ownerId: userId }, include: { expertise: true } }),
    prisma.teamExpertise.findMany({ where: { ownerId: userId }, orderBy: { label: "asc" } }),
  ]);
  if (!member) return notFound();
  return (
    <>
      <PageHeader
        eyebrow={member.isOwner ? "Eigenes Profil" : "Team-Mitglied"}
        title={`${member.firstName} ${member.lastName}`}
        subtitle={member.role ?? undefined}
      />
      <TeamForm
        initial={{
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
          email: member.email,
          phone: member.phone,
          avatarUrl: member.avatarUrl,
          bio: member.bio,
          instagram: member.instagram,
          facebook: member.facebook,
          tiktok: member.tiktok,
          website: member.website,
          isOwner: member.isOwner,
          expertiseIds: member.expertise.map((e) => e.id),
        }}
        expertise={expertise}
        action={updateTeamMember.bind(null, id)}
        deleteAction={deleteTeamMember.bind(null, id)}
      />
    </>
  );
}
