import * as React from "react";

import { cn } from "../../lib/utils";
import { formControlVariants } from "./form-control";

export function Select({ className, density, ...props }: React.ComponentProps<"select"> & { density?: "default" | "compact" }) {
  return <select className={cn(formControlVariants({ density }), className)} {...props} />;
}
