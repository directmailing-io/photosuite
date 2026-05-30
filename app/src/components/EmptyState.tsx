import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="mb-4 text-taupe">{icon}</div>}
      <div className="font-serif text-2xl text-ink">{title}</div>
      {description && <div className="text-sm text-smoke mt-2 max-w-md">{description}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
