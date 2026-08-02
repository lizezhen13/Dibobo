import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { formatMoney, formatPercent, movementClass } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { OverviewPanel, PanelState } from "./overview-panel";
import type { OverviewDragonTiger } from "./types";

function moneyTone(value: number | null) {
  if (value === null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-market-up" : "text-market-down";
}

export function DragonTigerCard({
  query,
}: {
  query: UseQueryResult<OverviewDragonTiger, Error>;
}) {
  const data = query.data;

  return (
    <OverviewPanel
      title="龙虎榜资金方向"
      label="CAPITAL FLOW"
      updatedAt={data?.updated_at}
      stale={data?.stale}
      isFetching={query.isFetching}
      toolbar={
        data?.trade_date ? (
          <span className="hidden font-mono text-[11px] tracking-normal text-muted-foreground/60 md:inline">
            {data.trade_date}
          </span>
        ) : null
      }
      className="min-h-[350px]"
    >
      {query.isPending ? (
        <PanelState kind="loading" />
      ) : query.isError ? (
        <PanelState kind="error" message="龙虎榜资金数据暂时无法加载" />
      ) : !data ? (
        <PanelState kind="error" message="龙虎榜未返回有效数据" />
      ) : data.data_source.state !== "ready" ? (
        <PanelState kind="unavailable" message={data.data_source.message} />
      ) : data.items.length === 0 ? (
        <PanelState kind="empty" />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="grid shrink-0 grid-cols-3 border-b border-border/70 bg-muted/25">
            {[
              ["榜单净额", data.summary.net_value],
              ["机构净额", data.summary.org_net_value],
              ["游资净额", data.summary.hot_money_net_value],
            ].map(([label, value]) => (
              <div key={label as string} className="min-w-0 border-r border-border/70 px-4 py-3 last:border-r-0">
                <p className="truncate text-[11px] text-muted-foreground/60">{label}</p>
                <p className={cn("mt-1 truncate font-mono text-[13px] font-medium tracking-normal", moneyTone(value as number))}>
                  {formatMoney(value as number)}
                </p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_64px_92px] gap-2 border-b border-border/70 px-4 py-2 font-mono text-[10px] tracking-normal text-muted-foreground/50">
            <span>股票</span>
            <span className="text-right">涨跌</span>
            <span className="text-right">净买入</span>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-border/65 overflow-y-auto">
            {data.items.slice(0, 8).map((item) => {
              const percent = item.change === null ? null : item.change * 100;
              const DirectionIcon = percent === null || percent === 0 ? Minus : percent > 0 ? ArrowUpRight : ArrowDownRight;
              return (
                <div
                  key={item.thscode}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_64px_92px] items-center gap-2 px-4 transition-colors hover:bg-row-hover"
                  title={item.limit_reason ?? undefined}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-foreground/90">{item.name}</p>
                      {item.hot_rank !== null && (
                        <span className="shrink-0 font-mono text-[10px] tracking-normal text-primary/75">
                          #{item.hot_rank}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[10px] tracking-normal text-muted-foreground/45">
                      {item.ticker}
                    </p>
                  </div>
                  <span className={cn("flex items-center justify-end gap-1 font-mono text-[11px] tracking-normal", movementClass(percent))}>
                    <DirectionIcon size={11} />
                    {formatPercent(percent)}
                  </span>
                  <span className={cn("truncate text-right font-mono text-xs tracking-normal", moneyTone(item.net_value))}>
                    {formatMoney(item.net_value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </OverviewPanel>
  );
}
