"use client";

import { CalendarPlus } from "lucide-react";

export function CalendarDownloadButton({
  slug,
  dateId,
  label,
  size = "md",
}: {
  slug: string;
  dateId?: string;
  label: string;
  size?: "sm" | "md";
}) {
  const url = dateId ? `/api/k/${slug}/ical?date=${dateId}` : `/api/k/${slug}/ical`;
  return (
    <a
      href={url}
      className={size === "sm" ? "btn-primary h-9 text-xs" : "btn-accent"}
    >
      <CalendarPlus size={size === "sm" ? 13 : 16} />
      {label}
    </a>
  );
}
