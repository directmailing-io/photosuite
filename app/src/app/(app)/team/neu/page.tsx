import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader";
import { TeamForm } from "../TeamForm";
import { createTeamMember } from "../actions";

export default async function NeuPage() {
  const expertise = await prisma.teamExpertise.findMany({ orderBy: { label: "asc" } });
  return (
    <>
      <PageHeader eyebrow="Neu" title="Mitglied anlegen" subtitle="Wer macht sonst noch mit?" />
      <TeamForm expertise={expertise} action={createTeamMember} />
    </>
  );
}
