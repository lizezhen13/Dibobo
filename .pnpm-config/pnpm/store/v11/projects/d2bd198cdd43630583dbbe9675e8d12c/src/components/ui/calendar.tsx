import * as React from "react";
import { Chevron } from "react-day-picker";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "./button";
import { cn } from "../../lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "relative w-fit",
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-4",
        month_caption: "relative flex h-11 items-center justify-center px-10",
        caption_label: "text-body-sm font-semibold",
        nav: "pointer-events-none absolute inset-x-3 top-3 z-10 flex items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "pointer-events-auto bg-transparent p-0"),
        button_next: cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "pointer-events-auto bg-transparent p-0"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-subtle rounded-md w-9 font-medium text-caption",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-body-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-primary/10",
          "[&:has([aria-selected].day-range_end)]:rounded-r-md",
          "[&:has([aria-selected].day-range_start)]:rounded-l-md",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day_button: cn(buttonVariants({ variant: "ghost" }), "size-9 p-0 font-normal text-inherit hover:text-inherit"),
        selected:
          "bg-primary text-primary-foreground [&_button]:bg-primary [&_button]:text-primary-foreground [&_button:hover]:bg-primary-hover [&_button:hover]:text-primary-foreground",
        today: "bg-secondary text-foreground",
        outside: "text-subtle",
        disabled: "text-subtle opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => (
          <Chevron orientation={orientation} className={cn("size-4 fill-current", chevronClassName)} {...chevronProps} />
        ),
      }}
      {...props}
    />
  );
}
