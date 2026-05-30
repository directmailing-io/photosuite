// Offizielle Brand-Logos der Kalender-Anbieter.
// Quellen: jeweilige offizielle Brand Guidelines (siehe Kommentare).
// Verwendung NUR im Connect-Kontext gemäß Trademark-Richtlinien.

export function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-label="Google">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.1 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C40.9 35.7 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function MicrosoftLogo({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" width={size} height={size} aria-label="Microsoft">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export function AppleLogo({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 170" width={size} height={size} aria-label="Apple" fill={color}>
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925s12.793-5.51 19.948-5.629c3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.238 3.599 1.339 0 5.877-1.416 13.57-4.239 7.275-2.618 13.415-3.702 18.445-3.275 13.63 1.1 23.87 6.473 30.68 16.153-12.19 7.386-18.22 17.731-18.1 31.002.11 10.337 3.86 18.939 11.23 25.769 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.102-2.96 15.667-8.86 22.669-7.12 8.324-15.732 13.134-25.071 12.375a25.222 25.222 0 0 1-.188-3.07c0-7.778 3.386-16.102 9.399-22.908 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.083.17 2.166.17 3.24z" />
    </svg>
  );
}

// Nextcloud — drei verbundene Kreise (Mark-only)
export function NextcloudLogo({ size = 28 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 196 110" width={size} height={(size * 110) / 196} aria-label="Nextcloud" fill="#0082C9">
      <path d="M55.92 18.27c-19.13 0-35.3 12.97-40.16 30.55C11.04 38.92 1.4 32.27-9.7 32.27v.01C-26.43 32.28-40 45.85-40 62.59c0 16.74 13.57 30.31 30.3 30.31 11.1 0 20.74-6.65 25.46-16.55 4.86 17.58 21.03 30.55 40.16 30.55 19.04 0 35.13-12.83 40.07-30.28 4.78 9.78 14.34 16.28 25.35 16.28 16.74 0 30.31-13.57 30.31-30.31 0-16.74-13.57-30.31-30.31-30.31-11.01 0-20.57 6.5-25.35 16.28-4.94-17.45-21.03-30.29-40.07-30.29zm0 14c15.61 0 28.16 12.55 28.16 28.15 0 15.6-12.55 28.16-28.16 28.16-15.6 0-28.15-12.56-28.15-28.16 0-15.6 12.55-28.15 28.15-28.15zm105.36 14c9.18 0 16.31 7.13 16.31 16.31 0 9.18-7.13 16.31-16.31 16.31-9.18 0-16.3-7.13-16.3-16.31 0-9.18 7.12-16.31 16.3-16.31zm-170.98.01c9.17 0 16.3 7.12 16.3 16.3 0 9.18-7.13 16.31-16.3 16.31-9.18 0-16.31-7.13-16.31-16.31 0-9.18 7.13-16.3 16.31-16.3z" transform="translate(40 0)" />
    </svg>
  );
}

// Generischer CalDAV / Mailbox.org / Posteo — wir zeigen ein neutrales Briefumschlag-Symbol,
// weil diese Anbieter keine vergleichbare "Connect-Button"-Brandidentität haben.
export function MailboxOrgLogo({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} aria-label="mailbox.org" fill="none" stroke="#0e7c66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

export function PosteoLogo({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} aria-label="Posteo" fill="none" stroke="#00833a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

// Generisches Kalender-Icon für Custom-CalDAV-Server
export function CalDAVGenericLogo({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} aria-label="CalDAV" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
