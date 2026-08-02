import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "../../lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-xl border border-border bg-popover text-popover-foreground shadow-dialog outline-none will-change-transform data-[state=closed]:animate-[fade-out_150ms_ease-in] data-[state=open]:animate-[fade-in_180ms_ease-out]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
