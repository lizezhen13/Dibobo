import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[.08em]",
  {
    variants: {
      variant: {
        neutral: "border-line bg-paper-deep text-ink-muted",
        success: "border-market-down/20 bg-market-down/8 text-market-down",
        warning: "border-accent/30 bg-accent/10 text-accent-deep",
        danger: "border-market-up/20 bg-market-up/8 text-market-up",
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

