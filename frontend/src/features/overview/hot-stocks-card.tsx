import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { cn } from "../../lib/utils";
import { OverviewPanel, PanelState } from "./overview-panel";
import type { HotStockItem, OverviewHotStocks, RankTrend } from "./types";
import { useAutoCarousel } from "./use-auto-carousel";

function formatHeat(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value || "-";
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
}

const trendIcon = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
  unknown: Minus,
} satisfies Record<RankTrend, typeof ArrowUp>;

function HotStockRow({ item }: { item: HotStockItem }) {
  const TrendIcon = trendIcon[item.rank_trend];
  const trendTone =
    item.rank_trend === "up"
      ? "text-market-up"
      : item.rank_trend === "down"
        ? "text-market-down"
        : "text-muted-foreground";

  return (
    <div
      data-carousel-item
      className="grid min-h-11 grid-cols-[32px_minmax(0,1fr)_72px_52px] items-center gap-2 px-4 transition-colors hover:bg-row-hover"
    >
      <span
        className={cn(
          "font-mono text-[13px] tracking-normal text-muted-foreground",
          item.rank <= 3 && "font-semibold text-primary",
        )}
      >
        {String(item.rank).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground/90">{item.name}</p>
        <p className="font-mono text-[10px] tracking-normal text-muted-foreground/45">{item.ticker}</p>
      </div>
      <span className="truncate text-right font-mono text-[13px] tracking-normal text-foreground/80">
        {formatHeat(item.heat)}
      </span>
      <span className={cn("flex items-center justify-end gap-1 font-mono text-[11px] tracking-normal", trendTone)}>
        <TrendIcon size={11} />
        {item.rank_change === null ? "-" : Math.abs(item.rank_change)}
      </span>
    </div>
  );
}

export function HotStocksCard({
  query,
}: {
  query: UseQueryResult<OverviewHotStocks, Error>;
}) {
  const data = query.data;
  const items = data?.items.slice(0, 30) ?? [];
  const carouselRef = useAutoCarousel<HTMLDivElement>({
    itemCount: items.length,
    speedPxPerSecond: 8,
  });

  return (
    <OverviewPanel
      title="市场人气榜"
      label="HOUR HOT LIST"
      updatedAt={data?.updated_at}
      stale={data?.stale}
      isFetching={query.isFetching}
      className="min-h-[350px]"
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
          <div className="grid grid-cols-[32px_minmax(0,1fr)_72px_52px] gap-2 border-b border-border/70 px-4 py-2 font-mono text-[10px] tracking-normal text-muted-foreground/50">
            <span>排名</span>
            <span>股票</span>
            <span className="text-right">热度</span>
            <span className="text-right">趋势</span>
          </div>
          <div ref={carouselRef} className="overview-carousel-viewport min-h-0 flex-1 overflow-hidden">
            <div data-carousel-track className="overview-carousel-track divide-y divide-border/65">
              {items.map((item, index) => (
                <HotStockRow key={`${item.thscode}-${index}`} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </OverviewPanel>
  );
}
