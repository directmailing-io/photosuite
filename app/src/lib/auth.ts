import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(creds) {
        const email = (creds?.email as string)?.toLowerCase().trim();
        const password = creds?.password as string;
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.uid && session.user) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    },
  },
});

/**
 * Zentraler Helper für alle Server-Actions und Server-Components in Multi-Tenant-Kontext.
 *
 * Garantiert: Rückgabewert ist eine valide User-ID, sonst throw.
 *
 * Nutzung als ERSTE Zeile in JEDER tenant-bezogenen Server-Action:
 *   const userId = await requireUserId();
 *
 * Bei abgelaufener Session oder bewusstem Logout während Action läuft:
 * sauberer Error statt stillschweigend null/undefined zu propagieren.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  if (!uid) throw new Error("Nicht angemeldet");
  return uid;
}
