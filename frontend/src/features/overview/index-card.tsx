import { CircleDot } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatPoint,
  formatSignedPoint,
  movementClass,
} from "../../lib/formatters";
import { cn } from "../../lib/utils";
import type { IndexCardData } from "./types";

const marketBadge = {
  交易中: "success",
  午间休市: "warning",
  已收盘: "neutral",
  休市: "neutral",
  未知: "neutral",
} as const;

export function IndexCard({ data, ordinal }: { data: IndexCardData; ordinal: number }) {
  const movement = movementClass(data.change_percent);
  return (
    <Card className="group relative min-h-[254px] overflow-hidden p-6 transition duration-300 hover:-translate-y-0.5 hover:border-ink/22 hover:shadow-[0_18px_45px_rgba(31,43,37,.09)]">
      <div className="absolute -right-1 -top-8 select-none font-display text-[116px] leading-none text-ink/[.028] transition group-hover:text-accent/[.06]">
        {String(ordinal).padStart(2, "0")}
      </div>
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-[22px] tracking-[-.01em] text-ink">{data.name}</p>
          <p className="mt-1.5 font-mono text-[11px] tracking-[.08em] text-ink-faint">{data.thscode}</p>
        </div>
        <Badge variant={marketBadge[data.market_status]}>
          <CircleDot size={9} /> {data.market_status}
        </Badge>
      </div>

      <div className="relative mt-8 flex items-end justify-between gap-6">
        <p className={cn("font-mono text-[38px] font-medium leading-none tracking-[-.045em]", data.latest === null && "font-body text-2xl tracking-normal text-ink-faint")}>
          {formatPoint(data.latest)}
        </p>
        <div className={cn("flex items-center gap-2 pb-0.5 font-mono text-sm font-semibold", movement)}>
          <span>{formatSignedPoint(data.change)}</span>
          <span>{formatPercent(data.change_percent)}</span>
        </div>
      </div>

      <div className="relative mt-8 grid grid-cols-[1fr_auto] items-end border-t border-line pt-4">
        <div>
          <p className="text-[10px] tracking-[.12em] text-ink-faint">成交额</p>
          <p className="mt-1.5 font-mono text-sm text-ink-muted">{formatMoney(data.turnover)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] tracking-[.12em] text-ink-faint">数据时间</p>
          <p className="mt-1.5 font-mono text-[11px] text-ink-muted">{formatDateTime(data.quoted_at)}</p>
        </div>
      </div>
    </Card>
  );
}

