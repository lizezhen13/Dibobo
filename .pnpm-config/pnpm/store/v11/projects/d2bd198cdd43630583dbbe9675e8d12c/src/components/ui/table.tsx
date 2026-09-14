import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";
import { cardVariants } from "./card";

export function TableFrame({ appearance = "card", className, ...props }: ComponentProps<"div"> & { appearance?: "card" | "embedded" }) {
  return (
    <div
      className={cn(
        "workspace-table-frame flex min-h-0 flex-col overflow-hidden",
        appearance === "card" && cardVariants({ variant: "raised", interactive: false }),
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full min-w-max border-separate border-spacing-0 text-left text-table", className)} {...props} />;
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("border-b border-border bg-secondary", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-border/60", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("group transition-colors duration-150 hover:bg-row-hover", className)} {...props} />;
}

export function TableHead({ density = "default", className, ...props }: ComponentProps<"th"> & { density?: "compact" | "default" }) {
  return (
    <th
      className={cn(
        "h-12 whitespace-nowrap px-5 py-3 align-middle text-label font-semibold tracking-wide text-muted-foreground",
        density === "compact" && "h-11 px-4 py-2",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ density = "default", className, ...props }: ComponentProps<"td"> & { density?: "compact" | "default" }) {
  return (
    <td
      className={cn(
        "h-16 whitespace-nowrap px-5 py-3 align-middle text-table text-foreground",
        density === "compact" && "h-14 px-4 py-2",
        className,
      )}
      {...props}
    />
  );
}
