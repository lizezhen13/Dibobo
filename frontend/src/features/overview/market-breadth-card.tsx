import type { UseQueryResult } from "@tanstack/react-query";

import { formatMoney } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { OverviewPanel, PanelState } from "./overview-panel";
import type { OverviewMarketBreadth } from "./types";

function binTone(index: number, total: number) {
  const middle = Math.floor(total / 2);
  if (index < middle) return "bg-market-down";
  if (index > middle) return "bg-market-up";
  return "bg-muted-foreground/65";
}

function countPercent(count: number, total: number) {
  return total > 0 ? (count / total) * 100 : 0;
}

export function MarketBreadthCard({
  query,
}: {
  query: UseQueryResult<OverviewMarketBreadth, Error>;
}) {
  const data = query.data;
  const maxCount = Math.max(1, ...(data?.bins.map((bin) => bin.count) ?? [1]));

  return (
    <OverviewPanel
      title="当前市场股票涨跌分布"
      label="MARKET BREADTH"
      updatedAt={data?.updated_at}
      stale={data?.stale}
      isFetching={query.isFetching}
      toolbar={
        data ? (
          <span className="hidden font-mono text-[11px] tracking-normal text-muted-foreground/60 sm:inline">
            {data.valid_count} 家
          </span>
        ) : null
      }
      className="min-h-[350px]"
    >
      {query.isPending ? (
        <PanelState kind="loading" />
      ) : query.isError ? (
        <PanelState kind="error" message="全市场涨跌分布暂时无法加载" />
      ) : !data ? (
        <PanelState kind="error" message="全市场行情接口未返回有效数据" />
      ) : data.data_source.state !== "ready" ? (
        <PanelState kind="unavailable" message={data.data_source.message} />
      ) : data.bins.length === 0 ? (
        <PanelState kind="empty" />
      ) : (
        <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-2">
          <div className="min-h-0 flex-1">
            {/* 柱状分布图自适应卡片宽度，无需横向滚动 */}
            <div className="grid h-full min-h-[170px] grid-cols-11 gap-1 border-b border-border/70">
              {data.bins.map((bin, index) => {
                // 柱高上限留到 88%，保证最高柱与顶部数字之间有明显空隙
                const height = bin.count === 0 ? 2 : Math.max(5, (bin.count / maxCount) * 88);
                return (
                  <div key={bin.key} className="grid min-w-0 grid-rows-[22px_minmax(90px,1fr)_28px]">
                    <span
                      className={cn(
                        "self-end truncate text-center font-mono text-[11px] tracking-tight text-muted-foreground",
                        index < 5 && "text-market-down",
                        index > 5 && "text-market-up",
                      )}
                    >
                      {bin.count}
                    </span>
                    {/* 底部留白，加大柱子与刻度标签之间的空隙 */}
                    <div className="flex min-h-0 items-end justify-center px-0.5 pb-2.5">
                      <div
                        className={cn("w-full max-w-10 rounded-t-[3px] opacity-90", binTone(index, data.bins.length))}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="self-center truncate whitespace-nowrap text-center font-mono text-[10px] tracking-tight text-muted-foreground/55">
                      {bin.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 shrink-0">
            <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-muted">
              <div
                className="bg-market-down"
                style={{ width: `${countPercent(data.down_count, data.valid_count)}%` }}
                title={`下跌 ${data.down_count} 家`}
              />
              <div
                className="bg-muted-foreground/55"
                style={{ width: `${countPercent(data.flat_count, data.valid_count)}%` }}
                title={`平盘 ${data.flat_count} 家`}
              />
              <div
                className="bg-market-up"
                style={{ width: `${countPercent(data.up_count, data.valid_count)}%` }}
                title={`上涨 ${data.up_count} 家`}
              />
            </div>
            {/* 底部指标：上涨/下跌/平盘·涨停·跌停/全市场成交额，分格展示 */}
            <div className="mt-3 grid grid-cols-4 divide-x divide-border/70 overflow-hidden rounded-md border border-border/70 bg-muted/20">
              {(
                [
                  ["上涨", data.up_count, "text-market-up"],
                  ["下跌", data.down_count, "text-market-down"],
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label} className="min-w-0 px-3 py-2.5">
                  <p className="truncate text-[10px] text-muted-foreground/55">{label}</p>
                  <p className={cn("mt-1 truncate font-mono text-[15px] font-semibold tracking-normal", tone)}>
                    {value}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground/50">家</span>
                  </p>
                </div>
              ))}
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-[10px] text-muted-foreground/55">涨停 / 平盘 / 跌停</p>
                <p className="mt-1 truncate font-mono text-[15px] font-semibold tracking-normal">
                  <span className="text-market-up">{data.strong_up_count}</span>
                  <span className="mx-1 text-muted-foreground/40">/</span>
                  <span className="text-muted-foreground">{data.flat_count}</span>
                  <span className="mx-1 text-muted-foreground/40">/</span>
                  <span className="text-market-down">{data.strong_down_count}</span>
                </p>
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-[10px] text-muted-foreground/55">全市场成交额</p>
                <p className="mt-1 truncate font-mono text-[15px] font-semibold tracking-normal text-foreground/85">
                  {formatMoney(data.turnover)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </OverviewPanel>
  );
}
