// Public-Layout für Online-Buchung — kein Sidebar, keine Auth.
// Studio-Branding-Header wird pro Seite gerendert, weil er Daten braucht (Logo/Name).
export default function PublicBookingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
