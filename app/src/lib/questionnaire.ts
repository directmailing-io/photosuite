// Feld-Typ-Definitionen — Single Source of Truth

export type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "EMAIL"
  | "PHONE"
  | "DATE"
  | "SELECT_SINGLE"
  | "SELECT_MULTI"
  | "YES_NO"
  | "RATING"
  | "FILE";

export const FIELD_TYPES: Array<{
  value: FieldType;
  label: string;
  hint: string;
  hasOptions: boolean;
}> = [
  { value: "TEXT", label: "Einzeiliger Text", hint: "Kurze Antwort, eine Zeile", hasOptions: false },
  { value: "TEXTAREA", label: "Mehrzeiliger Text", hint: "Längere Antwort, Absätze möglich", hasOptions: false },
  { value: "NUMBER", label: "Zahl", hint: "Ganze oder Dezimalzahl", hasOptions: false },
  { value: "EMAIL", label: "E-Mail", hint: "Mit Format-Prüfung", hasOptions: false },
  { value: "PHONE", label: "Telefon", hint: "Telefonnummer", hasOptions: false },
  { value: "DATE", label: "Datum", hint: "Datums-Picker", hasOptions: false },
  { value: "SELECT_SINGLE", label: "Einzelauswahl", hint: "Eine Option aus mehreren (Radio)", hasOptions: true },
  { value: "SELECT_MULTI", label: "Mehrfachauswahl", hint: "Mehrere Optionen (Checkbox)", hasOptions: true },
  { value: "YES_NO", label: "Ja / Nein", hint: "Toggle-Frage", hasOptions: false },
  { value: "RATING", label: "Sterne-Bewertung", hint: "1 bis 5 Sterne", hasOptions: false },
  { value: "FILE", label: "Datei-Upload", hint: "Bild oder PDF — max 10 MB, Bilder werden komprimiert", hasOptions: false },
];

export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export type StatusKey = "DRAFT" | "SENT" | "OPENED" | "IN_PROGRESS" | "SUBMITTED";

export const STATUS_LABELS: Record<StatusKey, { label: string; color: string }> = {
  DRAFT:        { label: "Entwurf",       color: "#9F877F" },
  SENT:         { label: "Versendet",     color: "#7D7878" },
  OPENED:       { label: "Geöffnet",      color: "#C8102E" },
  IN_PROGRESS:  { label: "In Bearbeitung", color: "#C8102E" },
  SUBMITTED:    { label: "Abgeschickt",   color: "#19191A" },
};
