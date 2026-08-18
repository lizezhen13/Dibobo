import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Input } from "../ui/input";

export interface RangeFilterDefinition {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  unit?: ReactNode;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  min?: number;
  step?: InputHTMLAttributes<HTMLInputElement>["step"];
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}

export function RangeFilterGrid({ fields, className }: { fields: RangeFilterDefinition[]; className?: string }) {
  return (
    <div className={cn("grid gap-px bg-border/50 sm:grid-cols-2", className)}>
      {fields.map((field) => (
        <fieldset key={field.key} className="min-w-0 bg-card px-5 py-4 sm:px-6">
          <legend className="w-full">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{field.label}</p>
                {field.description && (
                  <p className="mt-0.5 font-mono text-[0.6rem] tracking-[0.13em] text-muted-foreground/50">{field.description}</p>
                )}
              </div>
              {field.unit && <span className="font-mono text-[0.68rem] text-primary/70">{field.unit}</span>}
            </div>
          </legend>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <Input
              type="number"
              inputMode={field.inputMode ?? "decimal"}
              step={field.step ?? "any"}
              min={field.min}
              value={field.minValue}
              onChange={(event) => field.onMinChange(event.target.value)}
              placeholder="最小"
              aria-label={String(field.label) + "最小值"}
              className="h-9 px-3 font-mono text-xs"
            />
            <span className="font-mono text-xs text-muted-foreground/45">至</span>
            <Input
              type="number"
              inputMode={field.inputMode ?? "decimal"}
              step={field.step ?? "any"}
              min={field.min}
              value={field.maxValue}
              onChange={(event) => field.onMaxChange(event.target.value)}
              placeholder="最大"
              aria-label={String(field.label) + "最大值"}
              className="h-9 px-3 font-mono text-xs"
            />
          </div>
        </fieldset>
      ))}
    </div>
  );
}
