import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../../lib/utils";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

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
  collapsibleOnMobile?: boolean;
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
  collapsibleOnMobile = false,
}: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <Card variant="raised" className={cn("overflow-hidden", className)}>
      <div className="flex flex-col justify-between gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <p className="font-mono text-caption tracking-[0.16em] text-subtle">{eyebrow}</p>
            <p className="mt-0.5 font-display text-body-sm font-semibold text-foreground">{title}</p>
            {description && <p className="mt-1 text-caption text-subtle">{description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {trailing}
          {collapsibleOnMobile && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="md:hidden"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "收起筛选" : "展开筛选"}
              <ChevronDown size={16} className={cn(expanded && "rotate-180")} />
            </Button>
          )}
        </div>
      </div>
      <div id={contentId} className={cn("px-5 py-4 sm:px-6", collapsibleOnMobile && !expanded && "hidden md:block", contentClassName)}>
        {children}
      </div>
      {footer && <div className="border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
    </Card>
  );
}
