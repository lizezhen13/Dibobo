import * as React from "react";

import { cn } from "../../lib/utils";
import { formControlVariants } from "./form-control";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(formControlVariants(), "h-auto min-h-24 resize-y py-2.5 text-body leading-relaxed md:text-body", className)}
      {...props}
    />
  );
}
