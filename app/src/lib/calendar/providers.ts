// Provider-Stammdaten für die Kalender-Integration.
// CalDAV-Server-URLs aus den offiziellen Anleitungen der Anbieter (Mai 2026).
// Apple iCloud / Mailbox.org / Posteo brauchen App-spezifische Passwörter,
// Nextcloud-Setup ist user-spezifisch (eigener Server).

export type ProviderId = "google" | "microsoft" | "apple" | "nextcloud" | "mailbox" | "posteo" | "caldav_custom";

export type ProviderKind = "oauth" | "caldav";

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  kind: ProviderKind;
  description: string;
  caldavUrl?: string;
  emailHint?: string;
  passwordType?: "app-specific" | "regular";
  setupInstructions?: string[];
  cloudActWarning?: boolean;
  enabled: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  google: {
    id: "google",
    label: "Google Kalender",
    kind: "oauth",
    description: "Verbinde deinen Google-Account mit einem Klick. Echt-Zeit-Sync.",
    cloudActWarning: true,
    enabled: true,
  },
  microsoft: {
    id: "microsoft",
    label: "Microsoft Outlook",
    kind: "oauth",
    description: "Outlook.com oder Microsoft 365. Mit einem Klick verbinden.",
    cloudActWarning: true,
    enabled: false,
  },
  apple: {
    id: "apple",
    label: "Apple iCloud",
    kind: "caldav",
    caldavUrl: "https://caldav.icloud.com",
    emailHint: "Deine Apple ID (E-Mail)",
    passwordType: "app-specific",
    description: "Sync mit deinem iPhone-Kalender via iCloud.",
    setupInstructions: [
      "Oeffne appleid.apple.com und melde dich mit deiner Apple ID an",
      "Waehle 'Anmelden und Sicherheit' und dann 'App-spezifische Passwoerter'",
      "Klicke auf das Plus, vergib einen Namen wie 'Lisa CRM' und kopiere das 16-Zeichen-Passwort",
      "Trage Apple-Mail und Passwort hier ein",
    ],
    cloudActWarning: true,
    enabled: true,
  },
  nextcloud: {
    id: "nextcloud",
    label: "Nextcloud",
    kind: "caldav",
    emailHint: "Dein Nextcloud-Benutzername",
    passwordType: "app-specific",
    description: "Selfhosted oder bei einem Anbieter wie Hetzner. EU-konform.",
    setupInstructions: [
      "Logge dich in deine Nextcloud ein",
      "Einstellungen, dann Sicherheit, dann 'Neues App-Passwort erstellen'",
      "Vergib einen Namen wie 'Lisa CRM' und kopiere das Passwort",
      "Trage deine Nextcloud-URL, deinen Benutzernamen und das App-Passwort hier ein",
    ],
    enabled: true,
  },
  mailbox: {
    id: "mailbox",
    label: "mailbox.org",
    kind: "caldav",
    caldavUrl: "https://dav.mailbox.org",
    emailHint: "Deine mailbox.org-E-Mail",
    passwordType: "app-specific",
    description: "DE-konformer Anbieter aus Berlin.",
    setupInstructions: [
      "Logge dich in das mailbox.org Office Webinterface ein",
      "Einstellungen, dann Sicherheit, dann 'App-Passwoerter'",
      "Erstelle ein neues App-Passwort mit der Berechtigung 'CalDAV/CardDAV'",
      "Trage deine mailbox.org-Adresse und das App-Passwort hier ein",
    ],
    enabled: true,
  },
  posteo: {
    id: "posteo",
    label: "Posteo",
    kind: "caldav",
    caldavUrl: "https://posteo.de:8443",
    emailHint: "Deine Posteo-E-Mail",
    passwordType: "regular",
    description: "Datenschutz-orientierter EU-Anbieter aus Berlin.",
    setupInstructions: [
      "Trage deine Posteo-E-Mail und dein regulaeres Posteo-Passwort hier ein",
      "Hinweis: Posteo nutzt fuer CalDAV den Port 8443 - falls dein Netzwerk diesen blockiert, ist eine Verbindung nicht moeglich",
    ],
    enabled: true,
  },
  caldav_custom: {
    id: "caldav_custom",
    label: "Anderer CalDAV-Server",
    kind: "caldav",
    emailHint: "Benutzername oder E-Mail",
    passwordType: "app-specific",
    description: "Beliebiger CalDAV-Server (z.B. Fastmail, Synology, Radicale).",
    enabled: true,
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  "google",
  "apple",
  "microsoft",
  "nextcloud",
  "mailbox",
  "posteo",
  "caldav_custom",
];
