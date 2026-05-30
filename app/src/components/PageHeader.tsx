import { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode; // Actions rechts
};

export function PageHeader({ eyebrow, title, subtitle, children }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[40px] leading-[1.05] font-serif font-medium text-ink">{title}</h1>
        {subtitle && <p className="text-smoke mt-2 max-w-xl">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
