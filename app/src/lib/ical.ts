type ICalEvent = {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end?: Date | null;
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtUTC(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function fold(line: string) {
  // RFC 5545: lines max 75 octets — soft-wrap with CRLF + space
  const out: string[] = [];
  while (line.length > 73) {
    out.push(line.slice(0, 73));
    line = " " + line.slice(73);
  }
  out.push(line);
  return out.join("\r\n");
}

export function buildICS(events: ICalEvent[], calName = "Lisa Studio"): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Lisa CRM//DE");
  lines.push("CALSCALE:GREGORIAN");
  lines.push(`X-WR-CALNAME:${escapeText(calName)}`);
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${fmtUTC(new Date())}`);
    lines.push(`DTSTART:${fmtUTC(e.start)}`);
    if (e.end) lines.push(`DTEND:${fmtUTC(e.end)}`);
    else {
      const fallback = new Date(e.start.getTime() + 60 * 60 * 1000);
      lines.push(`DTEND:${fmtUTC(fallback)}`);
    }
    lines.push(fold(`SUMMARY:${escapeText(e.summary)}`));
    if (e.location) lines.push(fold(`LOCATION:${escapeText(e.location)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${escapeText(e.description)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
