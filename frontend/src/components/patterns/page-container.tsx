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
      true: "-mx-[var(--page-gutter-x)] -my-[var(--page-gutter-y)] w-[calc(100%+2*var(--page-gutter-x))] max-w-none",
      false: "",
    },
    layout: {
      document: "",
      workspace: "workspace-page",
      embedded: "external-content-page flex min-h-0 flex-col overflow-hidden",
    },
  },
  defaultVariants: {
    size: "default",
    edgeToEdge: false,
    layout: "document",
  },
});

export interface PageContainerProps extends ComponentProps<"section">, VariantProps<typeof pageContainerVariants> {}

export function PageContainer({ className, size, edgeToEdge, layout, ...props }: PageContainerProps) {
  return <section className={cn(pageContainerVariants({ size, edgeToEdge, layout }), className)} {...props} />;
}
