# Lisa CRM — MVP

Ein lokales Shooting-CRM für Boudoir-/Portrait-Fotograf:innen. Built mit Next.js + Prisma + SQLite.

## Was drin ist

- **Dashboard** mit Monatsumsatz, offenen Anzahlungen, nächsten Shootings, anstehenden Geburtstagen
- **Kunden**: Stammdaten, Rechnungsadresse, Profilbild, Social Links, Tags, Status, interne Notizen, automatischer Verlauf
- **Pakete**: Cover, Preis, Standard-Zahlungsbedingungen, Aktiv/Archiviert
- **Shootings**: Tabelle + **Kanban-Board** (Drag & Drop), individueller Preis, Anzahlung-Tracking, mehrere Checklisten, Datei-Anhänge
- **Aufgaben**: globales To-do-Modul, optional verknüpft mit Kundin/Shooting
- **Einstellungen**: Status (Kunden & Shootings) + Tags frei konfigurierbar

## Setup

```bash
cd app
npm install
npx prisma generate
npx prisma db push
npm run db:seed     # legt Standard-User, Status, Tags, Demo-Daten an
npm run dev         # http://localhost:3000
```

**Standard-Login:** `lisa@local.crm` / `lisa` (in `.env` änderbar)

## Wichtige Scripts

| Script | Zweck |
|---|---|
| `npm run dev` | Dev-Server starten |
| `npm run build && npm start` | Production-Build |
| `npm run db:push` | Schema in SQLite synchronisieren |
| `npm run db:seed` | Beispiel-Daten anlegen |
| `npm run db:studio` | Prisma Studio (DB-Browser) |
| `npm run db:reset` | DB löschen + frisch seeden |

## Datenmodell

`User · Customer · CustomerStatus · Tag · Package · Shooting · ShootingStatus · Checklist · ChecklistItem · Attachment · Task · Activity`

Schema-Quelle: [`prisma/schema.prisma`](prisma/schema.prisma)

## Ordnerstruktur

```
src/
  app/
    (app)/              # Authentifizierte Routen mit Sidebar-Layout
      page.tsx          # Dashboard
      kunden/
      pakete/
      shootings/
      aufgaben/
      einstellungen/
    login/
    api/auth/[...nextauth]/
  components/           # Sidebar, PageHeader, Avatar, StatusBadge, Drawer, Form, EmptyState
  lib/                  # prisma client, auth config, utils, upload
  middleware.ts         # Auth-Gate
public/
  uploads/              # Hochgeladene Dateien (gitignored)
  assets/               # Statische Brand-Assets
```

## Geplant für Phase 2 (Production-Migration)

- **DB**: SQLite → Postgres (self-hosted auf Hetzner)
- **Auth**: Multi-User (mehrere Fotograf:innen), Magic Links via Brevo
- **Payments**: Stripe (oder Mollie für EU-Stack) für Anzahlungen
- **Storage**: lokales `/uploads` → Hetzner Object Storage (S3-API)
- **Mail-Templates**: Brevo transaktional, Workflow-Trigger
- **E-Signatur**: skribble (CH)
- **Analytics**: Pirsch (self-hosted)
- **Hosting**: Coolify auf Hetzner Falkenstein

Tech-Stack-Begründung: siehe `../tech-stack-empfehlung.html`.

## Design-Token-Quellen

Farben und Typografie entstammen dem Branding der Optin-Page (`../optin-page-v2/`):
Editorial-Style mit `#F6F6F2` Off-White, `#19191A` Ink, `#C8102E` Akzent-Rot,
Cormorant Garamond (Serif) + Open Sans (Body) + Montserrat (UI-Caps).
