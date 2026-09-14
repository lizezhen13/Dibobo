import { format, parse } from "date-fns";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { Input } from "../../components/ui/input";
import { formControlVariants } from "../../components/ui/form-control";
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
            formControlVariants({ density: "compact" }),
            "items-center justify-between text-left hover:bg-accent hover:text-accent-foreground",
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
          <span className="text-caption text-muted-foreground">{value || "未选择日期"}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            清除
          </Button>
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
    <div className="flex min-w-0 items-center gap-1">
      <Input
        type="number"
        min={min}
        step={step}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="number-input--custom-stepper min-w-0 flex-1"
        {...registration}
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
      />
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="outline" size="icon" onClick={() => onStep(1)} aria-label={`增加${ariaLabel ?? "数值"}`}>
          <ChevronUp size={16} strokeWidth={2.25} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onStep(-1)}
          disabled={!canDecrease}
          aria-label={`减少${ariaLabel ?? "数值"}`}
        >
          <ChevronDown size={16} strokeWidth={2.25} />
        </Button>
      </div>
    </div>
  );
}
