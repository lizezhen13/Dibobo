import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { formatMoney, formatPercent, formatPoint, formatSignedPoint, movementClass } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import type { IndexCardData } from "./types";

export function IndexCard({ data, ordinal }: { data: IndexCardData; ordinal: number }) {
  const movement = movementClass(data.change_percent);
  const DirectionIcon =
    data.change_percent === null || data.change_percent === 0
      ? Minus
      : data.change_percent > 0
        ? ArrowUpRight
        : ArrowDownRight;

  return (
    <article className="relative min-w-0 border-b border-border/80 p-4 last:border-b-0 min-[900px]:border-r min-[900px]:[&:nth-child(even)]:border-r-0 min-[900px]:[&:nth-last-child(-n+2)]:border-b-0 min-[1400px]:border-b-0 min-[1400px]:border-r min-[1400px]:[&:nth-child(even)]:border-r min-[1400px]:last:border-r-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground/50">
              {String(ordinal).padStart(2, "0")}
            </span>
            <h3 className="truncate text-[15px] font-semibold tracking-normal text-foreground">{data.name}</h3>
          </div>
          <p className="mt-0.5 font-mono text-[11px] tracking-normal text-muted-foreground/55">
            {data.thscode}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/65">
          <span
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground/50",
              data.market_status === "交易中" && "bg-success",
            )}
          />
          {data.market_status}
        </span>
      </div>

      <div className="mt-4 flex min-w-0 items-end justify-between gap-3">
        <p
          className={cn(
            "min-w-0 truncate font-mono text-[28px] font-medium leading-none tracking-normal",
            data.latest === null ? "text-muted-foreground" : movement,
          )}
        >
          {formatPoint(data.latest)}
        </p>
        <div className={cn("flex shrink-0 items-center gap-1 font-mono text-[13px] tracking-normal", movement)}>
          <DirectionIcon size={14} />
          <span>{formatPercent(data.change_percent)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-border/70 pt-3">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="shrink-0 text-[11px] text-muted-foreground/60">涨跌额</span>
          <span className={cn("truncate font-mono text-xs tracking-normal", movement)}>
            {formatSignedPoint(data.change)}
          </span>
        </div>
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="shrink-0 text-[11px] text-muted-foreground/60">成交额</span>
          <span className="truncate font-mono text-xs tracking-normal text-muted-foreground">
            {formatMoney(data.turnover)}
          </span>
        </div>
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="shrink-0 text-[11px] text-muted-foreground/60">最低</span>
          <span className="truncate font-mono text-xs tracking-normal text-foreground/80">
            {formatPoint(data.low)}
          </span>
        </div>
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="shrink-0 text-[11px] text-muted-foreground/60">最高</span>
          <span className="truncate font-mono text-xs tracking-normal text-foreground/80">
            {formatPoint(data.high)}
          </span>
        </div>
      </div>
    </article>
  );
}
