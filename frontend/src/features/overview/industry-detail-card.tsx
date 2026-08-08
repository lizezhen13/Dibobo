import type { UseQueryResult } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { formatMoney, formatPercent, formatPoint, movementClass } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { OverviewPanel, PanelState } from "./overview-panel";
import type { OverviewIndustries } from "./types";

export function IndustryDetailCard({
  query,
}: {
  query: UseQueryResult<OverviewIndustries, Error>;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const data = query.data;
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!deferredSearch) return data.items;
    return data.items.filter((item) =>
      `${item.name} ${item.thscode}`.toLowerCase().includes(deferredSearch),
    );
  }, [data, deferredSearch]);

  return (
    <OverviewPanel
      title="行业板块"
      label="INDUSTRY SECTOR"
      updatedAt={data?.updated_at}
      stale={data?.stale}
      isFetching={query.isFetching}
      className="h-[680px] min-h-0 2xl:h-full"
    >
      {query.isPending ? (
        <PanelState kind="loading" className="h-full" />
      ) : query.isError ? (
        <PanelState kind="error" message="行业行情暂时无法加载" className="h-full" />
      ) : !data ? (
        <PanelState kind="error" message="行业接口未返回有效数据" className="h-full" />
      ) : data.data_source.state !== "ready" ? (
        <PanelState kind="unavailable" message={data.data_source.message} className="h-full" />
      ) : data.items.length === 0 ? (
        <PanelState kind="empty" className="h-full" />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-border/70 px-4 py-2.5">
            <label className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/55"
                size={13}
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="筛选行业"
                aria-label="筛选行业"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-[13px] tracking-normal text-foreground outline-none placeholder:text-muted-foreground/55 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <span className="shrink-0 font-mono text-[11px] tracking-normal text-muted-foreground/60">
              {filtered.length} / {data.total}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr className="border-b border-border text-[10px] text-muted-foreground/55">
                  <th className="w-[42%] px-4 py-2.5 font-normal">行业</th>
                  <th className="w-[19%] px-2 py-2.5 text-right font-normal">指数</th>
                  <th className="w-[17%] px-2 py-2.5 text-right font-normal">涨跌</th>
                  <th className="w-[22%] px-4 py-2.5 text-right font-normal">成交额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((item) => (
                  <tr key={item.thscode} className="h-11 transition-colors hover:bg-row-hover">
                    <td className="px-4 py-2">
                      <p className="truncate text-[13px] font-medium text-foreground/88">{item.name}</p>
                      <p className="truncate font-mono text-[10px] tracking-normal text-muted-foreground/40">
                        {item.thscode}
                      </p>
                    </td>
                    <td className="truncate px-2 py-2 text-right font-mono text-xs tracking-normal text-foreground/78">
                      {formatPoint(item.latest, { group: false })}
                    </td>
                    <td className={cn("truncate px-2 py-2 text-right font-mono text-xs tracking-normal", movementClass(item.change_percent))}>
                      {formatPercent(item.change_percent)}
                    </td>
                    <td className="truncate px-4 py-2 text-right font-mono text-[11px] tracking-normal text-muted-foreground">
                      {formatMoney(item.turnover)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="grid min-h-40 place-items-center text-[13px] text-muted-foreground">
                未找到匹配行业
              </div>
            )}
          </div>
        </div>
      )}
    </OverviewPanel>
  );
}
