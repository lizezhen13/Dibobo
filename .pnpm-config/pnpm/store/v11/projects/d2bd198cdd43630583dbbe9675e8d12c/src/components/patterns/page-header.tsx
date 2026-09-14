import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleId?: string;
  headingLevel?: 1 | 2 | 3;
  density?: "default" | "compact";
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  titleId,
  headingLevel = 1,
  density = "default",
}: PageHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";

  return (
    <header
      className={cn(
        "mb-8 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end sm:gap-8",
        density === "compact" && "mb-6 gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-primary-text">{eyebrow}</p>}
        <Heading
          id={titleId}
          className={cn("mt-2 font-display text-heading tracking-tight text-foreground", density === "default" && "sm:text-display")}
        >
          {title}
        </Heading>
        {description && <p className="mt-2.5 max-w-2xl text-body-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-3 sm:w-auto">{actions}</div>}
    </header>
  );
}
