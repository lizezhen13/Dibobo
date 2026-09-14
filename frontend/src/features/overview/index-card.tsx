import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { formatMoney, formatPercent, formatPoint, formatSignedPoint, movementClass } from "../../lib/formatters";
import { Metric } from "../../components/patterns/metric";
import { cn } from "../../lib/utils";
import type { IndexCardData } from "./types";

export function IndexCard({ data, ordinal }: { data: IndexCardData; ordinal: number }) {
  const movement = movementClass(data.change_percent);
  const DirectionIcon =
    data.change_percent === null || data.change_percent === 0 ? Minus : data.change_percent > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="relative min-w-0 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-caption text-subtle">{String(ordinal).padStart(2, "0")}</span>
            <h3 className="truncate text-body font-semibold tracking-normal text-foreground">{data.name}</h3>
            <span className="shrink-0 font-mono text-caption tracking-normal text-subtle">{data.thscode}</span>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-caption text-subtle">
          <span className={cn("size-1.5 rounded-full bg-muted-foreground/50", data.market_status === "交易中" && "bg-success")} />
          {data.market_status}
        </span>
      </div>

      <div className="mt-3 flex min-w-0 items-end justify-between gap-3">
        <p
          className={cn(
            "min-w-0 truncate font-mono text-heading font-medium leading-none tracking-normal",
            data.latest === null ? "text-muted-foreground" : movement,
          )}
        >
          {formatPoint(data.latest, { group: false })}
        </p>
        <div className={cn("flex shrink-0 items-center gap-1 font-mono text-table tracking-normal", movement)}>
          <DirectionIcon size={14} />
          <span>{formatPercent(data.change_percent)}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3">
        <Metric layout="inline" label="涨跌额" value={formatSignedPoint(data.change, { group: false })} valueClass={movement} />
        <Metric layout="inline" label="成交额" value={formatMoney(data.turnover)} />
        <Metric layout="inline" label="最低" value={formatPoint(data.low, { group: false })} />
        <Metric layout="inline" label="最高" value={formatPoint(data.high, { group: false })} />
      </div>
    </article>
  );
}
