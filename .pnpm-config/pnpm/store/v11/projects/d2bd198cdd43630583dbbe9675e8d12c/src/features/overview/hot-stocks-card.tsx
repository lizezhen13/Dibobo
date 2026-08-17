import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { memo } from "react";

import { cn } from "../../lib/utils";
import { OverviewPanel, PanelState } from "./overview-panel";
import type { HotStockItem, OverviewHotStocks, RankTrend } from "./types";

const heatFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatHeat(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value || "-";
  return heatFormatter.format(numeric);
}

const trendIcon = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
  unknown: Minus,
} satisfies Record<RankTrend, typeof ArrowUp>;

const HotStockRow = memo(function HotStockRow({ item }: { item: HotStockItem }) {
  const TrendIcon = trendIcon[item.rank_trend];
  const trendTone = item.rank_trend === "up" ? "text-market-up" : item.rank_trend === "down" ? "text-market-down" : "text-muted-foreground";

  return (
    <div className="grid min-h-11 grid-cols-[32px_minmax(0,1fr)_72px_52px] items-center gap-2 px-4 text-center transition-colors hover:bg-row-hover">
      <span className={cn("font-mono text-[13px] tracking-normal text-muted-foreground", item.rank <= 3 && "font-semibold text-primary")}>
        {String(item.rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 text-center">
        <p className="truncate text-[13px] font-medium text-foreground/90">{item.name}</p>
        <p className="font-mono text-[10px] tracking-normal text-muted-foreground/45">{item.ticker}</p>
      </div>
      <span className="truncate font-mono text-[13px] tracking-normal text-foreground/80">{formatHeat(item.heat)}</span>
      <span className={cn("flex items-center justify-center gap-1 font-mono text-[11px] tracking-normal", trendTone)}>
        <TrendIcon size={11} />
        {item.rank_change === null ? "-" : Math.abs(item.rank_change)}
      </span>
    </div>
  );
});

export function HotStocksCard({ query }: { query: UseQueryResult<OverviewHotStocks, Error> }) {
  const data = query.data;
  const items = data?.items.slice(0, 30) ?? [];

  return (
    <OverviewPanel
      title="市场人气榜"
      label="HOUR HOT LIST"
      updatedAt={data?.updated_at}
      stale={data?.stale}
      isFetching={query.isFetching}
      className="min-h-[330px]"
    >
      {query.isPending ? (
        <PanelState kind="loading" />
      ) : query.isError ? (
        <PanelState kind="error" message="市场人气榜暂时无法加载" />
      ) : !data ? (
        <PanelState kind="error" message="市场人气榜未返回有效数据" />
      ) : data.data_source.state !== "ready" ? (
        <PanelState kind="unavailable" message={data.data_source.message} />
      ) : data.items.length === 0 ? (
        <PanelState kind="empty" />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="grid grid-cols-[32px_minmax(0,1fr)_72px_52px] gap-2 border-b border-border/70 px-4 py-2 text-center text-[11.5px] font-semibold text-muted-foreground/60">
            <span>排名</span>
            <span>股票</span>
            <span>热度</span>
            <span>趋势</span>
          </div>
          <div className="overview-list-viewport min-h-0 flex-1 divide-y divide-border/65">
            {items.map((item) => (
              <HotStockRow key={item.thscode} item={item} />
            ))}
          </div>
        </div>
      )}
    </OverviewPanel>
  );
}
