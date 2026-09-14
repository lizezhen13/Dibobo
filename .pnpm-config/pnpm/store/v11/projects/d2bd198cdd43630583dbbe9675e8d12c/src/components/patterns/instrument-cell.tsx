import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export function InstrumentCell({
  name,
  code,
  suffix,
  draggable = false,
  align = "center",
}: {
  name: string;
  code: string;
  suffix?: ReactNode;
  draggable?: boolean;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("relative min-w-0", align === "center" && "text-center max-md:text-left", draggable && "md:px-5")}>
      {draggable && <GripVertical className="absolute left-0 top-1 hidden cursor-grab text-subtle md:block" size={16} aria-hidden="true" />}
      <p className="break-words text-table font-semibold text-foreground">{name}</p>
      <p
        className={cn(
          "mt-1 flex flex-wrap items-center gap-2 font-mono text-caption text-subtle",
          align === "center" && "md:justify-center",
        )}
      >
        <span>{code}</span>
        {suffix}
      </p>
    </div>
  );
}
