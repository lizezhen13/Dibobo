import type * as React from "react";

import { cn } from "../../lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded bg-ink/8", className)} {...props} />;
}

