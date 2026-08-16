import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

const pageContainerVariants = cva("mx-auto w-full animate-enter", {
  variants: {
    size: {
      compact: "max-w-[960px]",
      default: "max-w-[1280px]",
      wide: "max-w-[1600px]",
      fluid: "max-w-none",
    },
    edgeToEdge: {
      true: "-mx-4 -my-5 max-w-none sm:-mx-6 sm:-my-7 lg:-m-8 xl:-m-10",
      false: "",
    },
  },
  defaultVariants: {
    size: "default",
    edgeToEdge: false,
  },
});

export interface PageContainerProps extends ComponentProps<"section">, VariantProps<typeof pageContainerVariants> {}

export function PageContainer({ className, size, edgeToEdge, ...props }: PageContainerProps) {
  return <section className={cn(pageContainerVariants({ size, edgeToEdge }), className)} {...props} />;
}
