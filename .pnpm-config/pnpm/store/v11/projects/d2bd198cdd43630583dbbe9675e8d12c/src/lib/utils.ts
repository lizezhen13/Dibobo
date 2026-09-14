import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Keep project typography independent from text colors when composing variants.
export const typographySizes = [
  "caption-xs",
  "caption",
  "label",
  "table",
  "body-sm",
  "body",
  "title-sm",
  "title",
  "heading",
  "display",
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...typographySizes] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
