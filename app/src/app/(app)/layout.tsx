import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Defensiv: wenn die Middleware die Session-Prüfung verschluckt hat (z.B. abgelaufene
  // Session zwischen Middleware-Pass und Layout-Render), gehen wir zurück auf /login,
  // statt eine kryptische Server-Exception zu zeigen.
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    redirect("/login");
  }

  const [user, submittedRaw, pendingBookings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.questionnaire.findMany({
      where: { status: "SUBMITTED", shooting: { ownerId: userId } },
      select: { seenByStudioAt: true, submittedAt: true },
    }),
    prisma.booking.count({ where: { status: "PENDING", ownerId: userId } }),
  ]);
  const newSubmissions = submittedRaw.filter(
    (q) => !q.seenByStudioAt || (q.submittedAt && q.seenByStudioAt < q.submittedAt),
  ).length;
  return (
    <div className="flex min-h-screen">
      <Sidebar
        userName={user?.name}
        studioName={user?.studioName}
        newQuestionnaireSubmissions={newSubmissions}
        pendingBookings={pendingBookings}
      />
      <main className="flex-1 min-w-0">
        <div className="max-w-[1400px] mx-auto px-8 py-10 page-enter">{children}</div>
      </main>
    </div>
  );
}
