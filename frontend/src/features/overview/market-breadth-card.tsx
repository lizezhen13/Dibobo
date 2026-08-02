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
            {data.valid_count.toLocaleString("zh-CN")} 家
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
        <div className="flex h-full min-h-0 flex-col px-5 pb-4 pt-3">
          <div className="min-h-0 flex-1 overflow-x-auto">
            <div className="grid h-full min-h-[170px] min-w-[650px] grid-cols-11 gap-2 border-b border-border/70 px-1">
              {data.bins.map((bin, index) => {
                const height = bin.count === 0 ? 2 : Math.max(5, (bin.count / maxCount) * 100);
                return (
                  <div key={bin.key} className="grid min-w-0 grid-rows-[22px_minmax(90px,1fr)_28px]">
                    <span
                      className={cn(
                        "self-end text-center font-mono text-[11px] tracking-normal text-muted-foreground",
                        index < 5 && "text-market-down",
                        index > 5 && "text-market-up",
                      )}
                    >
                      {bin.count.toLocaleString("zh-CN")}
                    </span>
                    <div className="flex min-h-0 items-end justify-center px-1.5">
                      <div
                        className={cn("w-full max-w-10 rounded-t-[3px] opacity-90", binTone(index, data.bins.length))}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="self-center whitespace-nowrap text-center font-mono text-[10px] tracking-normal text-muted-foreground/55">
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
            <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6">
              {[
                ["下跌", data.down_count, "text-market-down"],
                ["平盘", data.flat_count, "text-muted-foreground"],
                ["上涨", data.up_count, "text-market-up"],
                ["≤ -9.8%", data.strong_down_count, "text-market-down"],
                ["≥ 9.8%", data.strong_up_count, "text-market-up"],
              ].map(([label, value, tone]) => (
                <div key={label as string} className="min-w-0">
                  <p className="truncate text-[10px] text-muted-foreground/55">{label}</p>
                  <p className={cn("mt-0.5 truncate font-mono text-[13px] font-medium tracking-normal", tone as string)}>
                    {(value as number).toLocaleString("zh-CN")}
                  </p>
                </div>
              ))}
              <div className="min-w-0 text-right">
                <p className="truncate text-[10px] text-muted-foreground/55">成交额</p>
                <p className="mt-0.5 truncate font-mono text-[11px] tracking-normal text-foreground/75">
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
