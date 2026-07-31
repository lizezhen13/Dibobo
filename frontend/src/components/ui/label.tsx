import * as React from "react";

import { cn } from "../../lib/utils";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "block text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
