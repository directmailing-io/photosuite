// Lädt den aktuell eingeloggten User — robust gegen alte Sessions ohne uid im Token.
// Verwende diese statt direktem prisma.user.findUnique, damit Bestands-Logins
// nach Schema-/Auth-Erweiterungen weiter funktionieren ohne Re-Login.
import { prisma } from "./prisma";

type SessionLike = { user?: { id?: string; email?: string | null } | null } | null | undefined;

export async function loadCurrentUser(session: SessionLike) {
  if (!session?.user) return null;
  const id = (session.user as { id?: string }).id;
  if (id) {
    const byId = await prisma.user.findUnique({ where: { id } });
    if (byId) return byId;
  }
  if (session.user.email) {
    return await prisma.user.findUnique({ where: { email: session.user.email } });
  }
  return null;
}
