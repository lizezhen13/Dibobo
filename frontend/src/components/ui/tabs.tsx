import { cva, type VariantProps } from "class-variance-authority";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "../../lib/utils";

export const Tabs = TabsPrimitive.Root;

type TabsVariant = "pill" | "underline" | "segment";

const tabsVariantContext = React.createContext<TabsVariant>("pill");

const tabsListVariants = cva("inline-flex items-center text-muted-foreground", {
  variants: {
    variant: {
      pill: "h-10 justify-center rounded-xl bg-secondary p-1",
      underline: "h-12 justify-start gap-6 rounded-none border-b border-border bg-transparent p-0",
      segment: "h-10 justify-center rounded-lg bg-secondary p-1",
    },
  },
  defaultVariants: { variant: "pill" },
});

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        pill: "rounded-lg px-4 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-subtle hover:text-foreground",
        underline:
          "relative h-12 gap-2 rounded-none border-b-2 border-transparent px-0 text-muted-foreground/60 data-[state=active]:border-primary data-[state=active]:text-foreground hover:text-foreground",
        segment:
          "rounded-md px-3 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-subtle hover:text-foreground",
      },
    },
    defaultVariants: { variant: "pill" },
  },
);

export interface TabsListProps extends React.ComponentProps<typeof TabsPrimitive.List>, VariantProps<typeof tabsListVariants> {}

export function TabsList({ className, variant = "pill", children, ...props }: TabsListProps) {
  const resolvedVariant = variant ?? "pill";

  return (
    <TabsPrimitive.List className={cn(tabsListVariants({ variant: resolvedVariant }), className)} {...props}>
      <tabsVariantContext.Provider value={resolvedVariant}>{children}</tabsVariantContext.Provider>
    </TabsPrimitive.List>
  );
}

export interface TabsTriggerProps extends React.ComponentProps<typeof TabsPrimitive.Trigger>, VariantProps<typeof tabsTriggerVariants> {}

export function TabsTrigger({ className, variant, ...props }: TabsTriggerProps) {
  const inheritedVariant = React.useContext(tabsVariantContext);
  return <TabsPrimitive.Trigger className={cn(tabsTriggerVariants({ variant: variant ?? inheritedVariant }), className)} {...props} />;
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      {...props}
    />
  );
}
