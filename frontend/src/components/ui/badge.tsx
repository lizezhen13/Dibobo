import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[.08em]",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success/10 text-success",
        warning: "border-transparent bg-warning/12 text-warning",
        danger: "border-transparent bg-danger/10 text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

