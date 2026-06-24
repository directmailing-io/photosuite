import { ReactNode } from "react";

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && !error && <div className="text-xs text-smoke mt-1.5">{hint}</div>}
      {error && (
        <div className="text-xs mt-1.5" style={{ color: "rgb(var(--accent-deep))" }}>
          {error}
        </div>
      )}
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}
