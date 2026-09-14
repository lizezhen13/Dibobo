import * as React from "react";

import { cn } from "../../lib/utils";
import { formControlVariants } from "./form-control";

export function Input({ className, type, density, ...props }: React.ComponentProps<"input"> & { density?: "default" | "compact" }) {
  return (
    <input
      type={type}
      className={cn(
        formControlVariants({ density }),
        "file:border-0 file:bg-transparent file:text-label file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
