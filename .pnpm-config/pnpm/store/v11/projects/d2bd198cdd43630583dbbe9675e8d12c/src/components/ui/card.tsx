import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils";

const cardVariants = cva("rounded-xl border border-border", {
  variants: {
    variant: {
      flat: "bg-card shadow-none",
      raised: "bg-card shadow-raised",
      deep: "bg-card-deep shadow-subtle",
      dashed: "border-dashed bg-card/35 shadow-none",
    },
    interactive: {
      true: "transition-shadow duration-200 hover:shadow-dialog",
      false: "",
    },
  },
  defaultVariants: {
    variant: "raised",
    interactive: true,
  },
});

export interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, interactive }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-6 pb-4", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-xl tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mt-1 text-sm text-muted-foreground leading-relaxed", className)} {...props} />;
}
