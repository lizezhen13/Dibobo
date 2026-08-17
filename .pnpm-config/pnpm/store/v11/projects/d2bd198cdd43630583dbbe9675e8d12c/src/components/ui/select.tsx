import * as React from "react";

import { cn } from "../../lib/utils";

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background px-3.5 py-2 text-sm shadow-subtle transition-all duration-200 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25 aria-invalid:border-danger/70 aria-invalid:ring-2 aria-invalid:ring-danger/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
