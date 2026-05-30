import { Sidebar } from "@/components/Sidebar";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadCurrentUser } from "@/lib/loadUser";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const [user, submittedRaw] = await Promise.all([
    loadCurrentUser(session),
    prisma.questionnaire.findMany({
      where: { status: "SUBMITTED" },
      select: { seenByStudioAt: true, submittedAt: true },
    }),
  ]);
  const newSubmissions = submittedRaw.filter(
    (q) => !q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt),
  ).length;
  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={session?.user?.name}
        studioName={user?.studioName}
        newQuestionnaireSubmissions={newSubmissions}
      />
      <main className="flex-1 min-w-0">
        <div className="max-w-[1400px] mx-auto px-8 py-10 page-enter">{children}</div>
      </main>
    </div>
  );
}
