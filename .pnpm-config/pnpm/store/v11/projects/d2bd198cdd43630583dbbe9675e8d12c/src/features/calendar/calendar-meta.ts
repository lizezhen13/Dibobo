import { ArrowLeftRight, BarChart3, CalendarOff, Coins, Globe2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { CalendarCategory } from "./types";

export const CATEGORY_META: Record<CalendarCategory, { label: string; eyebrow: string; icon: LucideIcon; tone: string; chip: string }> = {
  macro: {
    label: "经济数据",
    eyebrow: "MACRO RELEASES",
    icon: Globe2,
    tone: "text-sky-300",
    chip: "border-sky-300/20 bg-sky-300/10 text-sky-200",
  },
  earnings: {
    label: "财报",
    eyebrow: "EARNINGS",
    icon: BarChart3,
    tone: "text-violet-300",
    chip: "border-violet-300/20 bg-violet-300/10 text-violet-200",
  },
  dividend: {
    label: "分红",
    eyebrow: "DIVIDENDS",
    icon: Coins,
    tone: "text-emerald-300",
    chip: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
  },
  split: {
    label: "拆合",
    eyebrow: "CORPORATE ACTIONS",
    icon: ArrowLeftRight,
    tone: "text-amber-300",
    chip: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  },
  closed: {
    label: "休市",
    eyebrow: "MARKET CLOSURES",
    icon: CalendarOff,
    tone: "text-rose-300",
    chip: "border-rose-300/20 bg-rose-300/10 text-rose-200",
  },
};

function fromIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1);
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(fromIsoDate(value));
}
