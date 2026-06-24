import type { Metadata } from "next";
import { Toaster } from "sonner";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import "./globals.css";

export const metadata: Metadata = {
  title: "photosuite",
  description: "Das CRM für Fotograf:innen.",
};

type ThemeKey = "lisa" | "studio" | "midnight";
const VALID_THEMES: ThemeKey[] = ["lisa", "studio", "midnight"];

async function getUserTheme(): Promise<ThemeKey> {
  try {
    const session = await auth();
    const uid = (session?.user as { id?: string } | undefined)?.id;
    if (!uid) return "lisa";
    const u = await prisma.user.findUnique({ where: { id: uid }, select: { theme: true } });
    const t = (u?.theme ?? "lisa") as ThemeKey;
    return VALID_THEMES.includes(t) ? t : "lisa";
  } catch {
    return "lisa";
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getUserTheme();
  return (
    <html lang="de" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Alle Theme-Fonts vorladen — Browser holt nur die, die das aktive Theme nutzt. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Open+Sans:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "rgb(var(--ink))",
              color: "rgb(var(--bg))",
              border: "1px solid rgb(var(--stone))",
              fontFamily: "var(--font-body)",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
