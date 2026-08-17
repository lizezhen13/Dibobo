import { useMemo, useState } from "react";
import { format, parse, addMonths, subMonths, startOfMonth, isAfter, isBefore, isSameDay } from "date-fns";
import { CalendarDays } from "lucide-react";

import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";

interface DateRangeFieldProps {
  openedFrom?: string;
  openedTo?: string;
  onChange: (openedFrom: string, openedTo: string) => void;
}

interface DateRange {
  from?: Date;
  to?: Date;
}

/** 将 YYYY-MM-DD 解析为本地时区 Date，避免 UTC 偏移导致日期错一天 */
function parseLocalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** 将 Date 格式化为 YYYY-MM-DD */
function formatLocalDate(date?: Date): string {
  if (!date) return "";
  return format(date, "yyyy-MM-dd");
}

export function DateRangeField({ openedFrom, openedTo, onChange }: DateRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const draft = useMemo<DateRange>(() => ({ from: parseLocalDate(openedFrom), to: parseLocalDate(openedTo) }), [openedFrom, openedTo]);
  const [leftMonth, setLeftMonth] = useState<Date>(() => startOfMonth(parseLocalDate(openedFrom) || new Date()));
  const [rightMonth, setRightMonth] = useState<Date>(() => addMonths(startOfMonth(parseLocalDate(openedFrom) || new Date()), 1));

  // 弹窗打开时，将月份定位到已选区间或当前月，保证两侧日历连续。
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    const base = startOfMonth(parseLocalDate(openedFrom) || parseLocalDate(openedTo) || new Date());
    setLeftMonth(base);
    setRightMonth(addMonths(base, 1));
  };

  const commit = (next: DateRange) => {
    onChange(formatLocalDate(next.from), formatLocalDate(next.to));
  };

  /** 选择起始日期：若结束日期早于新的开始日期，则自动将结束日期同步为开始日期 */
  const handleSelectStart = (date?: Date) => {
    if (!date) {
      commit({ from: undefined, to: undefined });
      return;
    }
    const next: DateRange = { from: date, to: draft.to };
    if (next.to && (isBefore(next.to, date) || isSameDay(next.to, date))) {
      next.to = date;
    }
    commit(next);
    // 自动将右侧日历切换到开始日期的下一个月，方便继续选择结束日期
    const base = startOfMonth(date);
    setLeftMonth(base);
    setRightMonth(addMonths(base, 1));
  };

  /** 选择结束日期：若结束日期早于起始日期，自动交换起止，保证始终合法 */
  const handleSelectEnd = (date?: Date) => {
    if (!date) {
      commit({ from: draft.from, to: undefined });
      return;
    }
    let next: DateRange;
    if (!draft.from) {
      next = { from: date, to: date };
    } else if (isBefore(date, draft.from)) {
      next = { from: date, to: draft.from };
    } else {
      next = { from: draft.from, to: date };
    }
    commit(next);
    // 选择完结束日期后自动关闭弹窗
    if (next.from && next.to) {
      setOpen(false);
    }
  };

  /** 高亮起止日期之间的日期（不含端点） */
  const inRangeModifier = (date: Date) => {
    if (!draft.from || !draft.to) return false;
    return isAfter(date, draft.from) && isBefore(date, draft.to);
  };

  const handleClear = () => {
    commit({ from: undefined, to: undefined });
  };

  const handleLeftMonthChange = (date: Date) => {
    const base = startOfMonth(date);
    setLeftMonth(base);
    setRightMonth(addMonths(base, 1));
  };

  const handleRightMonthChange = (date: Date) => {
    const base = startOfMonth(date);
    setRightMonth(base);
    setLeftMonth(subMonths(base, 1));
  };

  const display = useMemo(() => {
    const fromText = formatLocalDate(draft.from);
    const toText = formatLocalDate(draft.to);
    if (fromText && toText) return `${fromText} ~ ${toText}`;
    if (fromText) return `${fromText} ~ `;
    if (toText) return `~ ${toText}`;
    return "请选择时间段";
  }, [draft]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            !(draft.from || draft.to) && "text-muted-foreground",
          )}
        >
          <span className="truncate">{display}</span>
          <CalendarDays className="shrink-0 text-muted-foreground" size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1">
            <span className="px-1 text-xs font-medium text-muted-foreground">开始日期</span>
            <Calendar
              mode="single"
              selected={draft.from}
              onSelect={handleSelectStart}
              month={leftMonth}
              onMonthChange={handleLeftMonthChange}
              modifiers={{ inRange: inRangeModifier }}
              modifiersClassNames={{ inRange: "bg-primary/10 text-primary rounded-none" }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="px-1 text-xs font-medium text-muted-foreground">结束日期</span>
            <Calendar
              mode="single"
              selected={draft.to}
              onSelect={handleSelectEnd}
              month={rightMonth}
              onMonthChange={handleRightMonthChange}
              modifiers={{ inRange: inRangeModifier }}
              modifiersClassNames={{ inRange: "bg-primary/10 text-primary rounded-none" }}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <span className="text-xs text-muted-foreground">
            {draft.from && draft.to ? `共 ${formatLocalDate(draft.from)} 至 ${formatLocalDate(draft.to)}` : "请选择起止日期"}
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClear}>
            清除
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
