import { cva } from "class-variance-authority";

export const formControlVariants = cva(
  "form-control flex w-full rounded-lg border border-input bg-background px-3.5 py-2 text-body text-foreground shadow-subtle transition-colors placeholder:text-subtle focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger disabled:cursor-not-allowed disabled:opacity-50 md:text-body-sm",
  { variants: { density: { default: "h-11", compact: "h-10" } }, defaultVariants: { density: "default" } },
);
