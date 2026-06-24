"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Section = { id: string; label: string };

export function LandingNav({
  sections,
  studioName,
  logoUrl,
}: {
  sections: Section[];
  studioName?: string | null;
  logoUrl?: string | null;
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 100);
      // Active = die obere Sektion, deren oberer Rand im oberen Drittel ist
      let current = sections[0]?.id ?? "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top < 140) current = s.id;
      }
      setActive(current);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <nav
      className="sticky top-0 z-30 transition-all border-b"
      style={{
        background: scrolled ? "rgba(246,246,242,0.92)" : "rgba(25,25,26,0)",
        backdropFilter: scrolled ? "blur(8px)" : "none",
        borderColor: scrolled ? "rgb(var(--stone))" : "transparent",
        color: scrolled ? "rgb(var(--ink))" : "rgb(var(--bg))",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 h-24 flex items-center gap-6">
        {logoUrl ? (
          <div
            className={cn(
              "rounded-lg transition-all",
              scrolled ? "p-1" : "px-3 py-2 backdrop-blur-sm",
            )}
            style={{
              background: scrolled ? "transparent" : "rgba(255,255,255,0.88)",
              boxShadow: scrolled ? "none" : "0 1px 8px rgba(25,25,26,0.08)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt={studioName ?? "Studio"} className="h-[84px] w-auto object-contain block" />
          </div>
        ) : studioName ? (
          <div
            className={cn("transition-opacity", scrolled ? "opacity-100" : "opacity-90")}
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "22px",
              lineHeight: 1,
            }}
          >
            {studioName}
          </div>
        ) : (
          <div
            className={cn("transition-opacity leading-none", scrolled ? "opacity-100" : "opacity-90")}
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: "24px",
            }}
          >
            <span style={{ fontWeight: 500 }}>photo</span>
            <span style={{ fontStyle: "italic", fontWeight: 500, color: "rgb(var(--accent))" }}>suite</span>
          </div>
        )}
        <ul className="flex items-center gap-1 ml-auto flex-wrap justify-end">
          {sections.map((s) => {
            const isActive = active === s.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => scrollTo(s.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition"
                  style={{
                    fontFamily: '"Montserrat", "Open Sans", sans-serif',
                    letterSpacing: "0.12em",
                    background: isActive
                      ? scrolled ? "rgb(var(--ink))" : "rgba(255,255,255,0.18)"
                      : "transparent",
                    color: isActive
                      ? scrolled ? "rgb(var(--bg))" : "rgb(var(--bg))"
                      : scrolled ? "rgb(var(--smoke))" : "rgba(255,255,255,0.75)",
                  }}
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
