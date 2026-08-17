import * as React from "react";

import { cn } from "../../lib/utils";
import { Label } from "../ui/label";

interface FormFieldProps {
  label: React.ReactNode;
  children: React.ReactElement;
  error?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
}

export function FormField({ label, children, error, hint, required, className }: FormFieldProps) {
  const generatedId = React.useId().replaceAll(":", "");
  const childProps = children.props as {
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean | "true" | "false";
    "aria-required"?: boolean | "true" | "false";
  };
  const fieldId = childProps.id ?? `field-${generatedId}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const existingDescribedBy = childProps["aria-describedby"];
  const describedBy = [existingDescribedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    id: fieldId,
    "aria-invalid": error ? true : childProps["aria-invalid"],
    "aria-required": required ? true : childProps["aria-required"],
    "aria-describedby": describedBy,
  });

  return (
    <div className={cn("block", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label htmlFor={fieldId}>
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {hint && (
          <span id={hintId} className="font-mono text-xs font-normal tracking-normal text-muted-foreground/60">
            {hint}
          </span>
        )}
      </div>
      {control}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs leading-relaxed text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
