import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-3 py-1 text-[0.75rem] font-semibold tracking-wide", {
  variants: {
    variant: {
      neutral: "border-transparent bg-secondary text-secondary-foreground",
      success: "border-success/20 bg-success/10 text-success",
      warning: "border-warning/25 bg-warning/12 text-warning",
      danger: "border-danger/20 bg-danger/10 text-danger",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant = "neutral", ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
