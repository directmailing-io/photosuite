"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: number;
};

export function Drawer({ title, subtitle, open, onClose, footer, children, width = 560 }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="ml-auto relative h-full bg-bg shadow-lg flex flex-col"
        style={{ width: `min(${width}px, 100vw)` }}
      >
        <header className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-stone/60">
          <div>
            <div className="font-serif text-2xl text-ink">{title}</div>
            {subtitle && <div className="text-sm text-smoke mt-1">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Schließen">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && (
          <footer className="px-6 py-4 border-t border-stone/60 flex justify-end gap-2 bg-paper">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
