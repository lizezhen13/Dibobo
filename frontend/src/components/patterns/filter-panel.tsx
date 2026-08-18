import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

interface FilterPanelProps {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function FilterPanel({
  eyebrow,
  title,
  description,
  leading,
  trailing,
  children,
  footer,
  className,
  contentClassName,
}: FilterPanelProps) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-raised", className)}>
      <div className="flex flex-col justify-between gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <p className="font-mono text-caption tracking-[0.16em] text-muted-foreground/65">{eyebrow}</p>
            <p className="mt-0.5 font-display text-body-sm font-semibold text-foreground">{title}</p>
            {description && <p className="mt-1 text-caption text-muted-foreground/60">{description}</p>}
          </div>
        </div>
        {trailing}
      </div>
      <div className={cn("px-5 py-4 sm:px-6", contentClassName)}>{children}</div>
      {footer && <div className="border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
    </section>
  );
}
