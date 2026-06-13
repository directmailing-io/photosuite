// Gemeinsame Typen für Video-Provider-Integrationen.

export type CreateMeetingParams = {
  topic: string;             // Titel des Meetings ("Erstgespräch mit Anna")
  startAt: Date;             // UTC-ISO oder Date
  durationMin: number;
  customerEmail?: string;    // optional als Einladung
  customerName?: string;
};

export type CreatedMeeting = {
  joinUrl: string;
  externalId?: string;       // Provider-Meeting-ID (für späteres Löschen)
};

export type IntegrationError = {
  ok: false;
  reason: string;            // Fehlermeldung für UI/Log
};

export type IntegrationResult =
  | { ok: true; meeting: CreatedMeeting }
  | IntegrationError;

// Server-seitige Helfer für ENV-Validierung.
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`ENV ${name} fehlt — bitte in .env hinterlegen.`);
  return v;
}

export function optionalEnv(name: string): string | null {
  return process.env[name] || null;
}
