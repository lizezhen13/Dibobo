import * as React from "react";

import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed shadow-subtle transition-all duration-200 placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25 aria-invalid:border-danger/70 aria-invalid:ring-2 aria-invalid:ring-danger/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
