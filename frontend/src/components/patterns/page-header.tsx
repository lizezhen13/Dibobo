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
}

export function PageHeader({ eyebrow, title, description, actions, className, titleId, headingLevel = 1 }: PageHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";

  return (
    <header className={cn("mb-8 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end sm:gap-8", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-primary/90">{eyebrow}</p>}
        <Heading id={titleId} className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
          {title}
        </Heading>
        {description && <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-3 sm:w-auto">{actions}</div>}
    </header>
  );
}
