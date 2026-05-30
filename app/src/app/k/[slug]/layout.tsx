// Eigenes Layout für Kundenansicht — kein Sidebar, kein Auth
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
