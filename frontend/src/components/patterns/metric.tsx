import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export function Metric({
  label,
  value,
  icon: Icon,
  iconClass,
  valueClass,
  isLoading = false,
  layout = "stacked",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  iconClass?: string;
  valueClass?: string;
  isLoading?: boolean;
  layout?: "inline" | "stacked";
}) {
  return (
    <div className={cn("min-w-0", layout === "inline" && "flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1")}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon size={16} className={cn("shrink-0", iconClass)} aria-hidden="true" />}
        <p className="text-label text-muted-foreground">{label}</p>
      </div>
      {isLoading ? (
        <div className="mt-2 h-6 w-2/3 animate-pulse rounded-full bg-secondary" />
      ) : (
        <p
          className={cn(
            "numeric break-words [overflow-wrap:anywhere]",
            layout === "inline" ? "text-table" : "mt-1.5 text-title-sm font-semibold",
            valueClass ?? "text-foreground",
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}
