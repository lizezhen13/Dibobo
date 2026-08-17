import { format, parse } from "date-fns";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Calendar } from "../../components/ui/calendar";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";

export interface ControlA11yProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
}

function parseDialogDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDialogDate(date?: Date): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function SingleDateField({
  value,
  max,
  placeholder,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}: {
  value: string;
  max?: string;
  placeholder: string;
  onChange: (value: string) => void;
} & ControlA11yProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDialogDate(value);
  const maxDate = parseDialogDate(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            !value && "text-muted-foreground",
          )}
          aria-haspopup="dialog"
        >
          <span className="truncate">{value || placeholder}</span>
          <CalendarDays className="shrink-0 text-muted-foreground" size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatDialogDate(date));
            setOpen(false);
          }}
          disabled={maxDate ? { after: maxDate } : undefined}
        />
        <div className="flex items-center justify-between border-t border-border px-1 pt-2">
          <span className="text-xs text-muted-foreground">{value || "未选择日期"}</span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            清除
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NumberStepper({
  min,
  step,
  value,
  placeholder,
  registration,
  onStep,
  ariaLabel,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}: {
  min: number;
  step: number;
  value: string;
  placeholder: string;
  registration: UseFormRegisterReturn;
  onStep: (direction: 1 | -1) => void;
  ariaLabel?: string;
} & ControlA11yProps) {
  const numericValue = value === "" ? 0 : Number(value);
  const canDecrease = Number.isFinite(numericValue) && numericValue > min;

  return (
    <div className="group relative">
      <Input
        type="number"
        min={min}
        step={step}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="number-input--custom-stepper pr-10"
        {...registration}
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
      />
      <div className="invisible absolute right-1 top-1/2 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-md border border-border/70 bg-card-deep shadow-subtle opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <button
          type="button"
          className="pointer-events-auto grid h-4 w-6 place-items-center text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          onClick={() => onStep(1)}
          aria-label={`增加${ariaLabel ?? "数值"}`}
        >
          <ChevronUp size={12} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className="pointer-events-auto grid h-4 w-6 place-items-center text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
          onClick={() => onStep(-1)}
          disabled={!canDecrease}
          aria-label={`减少${ariaLabel ?? "数值"}`}
        >
          <ChevronDown size={12} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
