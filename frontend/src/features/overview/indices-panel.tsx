import type { UseQueryResult } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { IndexCard } from "./index-card";
import { OverviewPanel, PanelState } from "./overview-panel";
import type { OverviewIndices } from "./types";

function latestQuoteTime(data: OverviewIndices | undefined) {
  const timestamps = data?.indices
    .map((item) => item.quoted_at)
    .filter((value): value is string => Boolean(value));
  if (!timestamps?.length) return null;
  return timestamps.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
  );
}

export function IndicesPanel({
  query,
  onRefresh,
  isRefreshing,
}: {
  query: UseQueryResult<OverviewIndices, Error>;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const data = query.data;

  return (
    <OverviewPanel
      title="指数情况"
      label="INDEX OVERVIEW"
      updatedAt={latestQuoteTime(data)}
      stale={data?.stale}
      isFetching={query.isFetching}
      toolbar={
        <div className="flex items-center gap-2">
          {data ? (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <span
                className={cn(
                  "size-1.5 rounded-full bg-muted-foreground/50",
                  data.market_status === "交易中" && "bg-success",
                  data.market_status === "午间休市" && "bg-warning",
                )}
              />
              {data.market_status}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="依次刷新全部卡片"
            title="依次刷新全部卡片"
          >
            <RefreshCw className={isRefreshing ? "animate-spin" : undefined} size={15} />
          </Button>
        </div>
      }
      className="min-h-[220px]"
    >
      {query.isPending ? (
        <PanelState kind="loading" className="min-h-[166px]" />
      ) : query.isError ? (
        <PanelState kind="error" message="指数行情暂时无法加载" className="min-h-[166px]" />
      ) : !data ? (
        <PanelState kind="error" message="指数接口未返回有效数据" className="min-h-[166px]" />
      ) : data.data_source.state !== "ready" ? (
        <PanelState kind="unavailable" message={data.data_source.message} className="min-h-[166px]" />
      ) : (
        <div className="grid h-full grid-cols-1 min-[900px]:grid-cols-2 min-[1400px]:grid-cols-4">
          {data.indices.map((index, ordinal) => (
            <IndexCard key={index.thscode} data={index} ordinal={ordinal + 1} />
          ))}
        </div>
      )}
    </OverviewPanel>
  );
}
