import * as React from "react";

import { cn } from "../../lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-[3px] border border-line bg-paper px-3.5 text-[15px] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.7)] outline-none transition placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

