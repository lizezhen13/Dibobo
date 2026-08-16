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
        root: "w-fit",
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-4",
        month_caption: "flex h-9 justify-center items-center relative",
        caption_label: "text-sm font-semibold",
        nav: "flex items-center gap-1 absolute inset-x-0 justify-between px-1",
        button_previous: cn(buttonVariants({ variant: "outline", size: "icon" }), "size-7 bg-transparent p-0 opacity-70 hover:opacity-100"),
        button_next: cn(buttonVariants({ variant: "outline", size: "icon" }), "size-7 bg-transparent p-0 opacity-70 hover:opacity-100"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground/70 rounded-md w-9 font-medium text-[0.75rem]",
        week: "flex w-full mt-2",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-primary/10",
          "[&:has([aria-selected].day-range_end)]:rounded-r-md",
          "[&:has([aria-selected].day-range_start)]:rounded-l-md",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day_button: cn(buttonVariants({ variant: "ghost" }), "size-9 p-0 font-normal aria-selected:opacity-100"),
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-secondary text-foreground",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => (
          <Chevron orientation={orientation} className={cn("size-4", chevronClassName)} {...chevronProps} />
        ),
      }}
      {...props}
    />
  );
}
