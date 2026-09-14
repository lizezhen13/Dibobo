import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { cardVariants } from "../../components/ui/card";

import { usePortfolioSummariesQuery } from "../holdings/queries";
import type { HoldingSummary, Portfolio } from "../holdings/types";
import { formatPercent, movementClass } from "../../lib/formatters";
import { cn } from "../../lib/utils";

interface SummaryQuery {
  data?: HoldingSummary;
  isLoading: boolean;
}

export function PortfolioRail({
  portfolios,
  selectedId,
  isLoading,
  isReordering,
  onSelect,
  onCreate,
  onMove,
}: {
  portfolios: Portfolio[];
  selectedId?: string;
  isLoading: boolean;
  isReordering: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onMove: (portfolio: Portfolio, direction: -1 | 1) => void;
}) {
  const summaryQueries = usePortfolioSummariesQuery(portfolios.map((portfolio) => portfolio.id));

  return (
    <aside className={cn(cardVariants({ variant: "raised", interactive: false }), "flex min-h-0 flex-col overflow-hidden xl:h-full")}>
      <div className="border-b border-border px-4 py-4 xl:px-5 xl:py-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-title tracking-tight text-foreground">我的组合</h2>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg border border-primary/30 bg-primary/[0.08] text-primary-text transition-colors hover:border-primary/55 hover:bg-primary/[0.15]"
            onClick={onCreate}
            aria-label="新建投资组合"
            title="新建投资组合"
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 xl:hidden">
          <Select
            aria-label="选择投资组合"
            value={selectedId ?? ""}
            disabled={isLoading || portfolios.length === 0}
            onChange={(event) => onSelect(event.target.value)}
          >
            {portfolios.length === 0 && <option value="">{isLoading ? "正在加载组合…" : "暂无组合"}</option>}
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </Select>
          {portfolios.length > 1 &&
            ([-1, 1] as const).map((direction) => {
              const index = portfolios.findIndex((portfolio) => portfolio.id === selectedId);
              const portfolio = portfolios[index];
              return (
                <Button
                  key={direction}
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={isReordering || !portfolio || index + direction < 0 || index + direction >= portfolios.length}
                  aria-label={`将当前组合${direction === -1 ? "上移" : "下移"}`}
                  onClick={() => portfolio && onMove(portfolio, direction)}
                >
                  {direction === -1 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                </Button>
              );
            })}
        </div>
      </div>

      <div className="hidden max-h-[36rem] min-h-0 flex-1 space-y-2 overflow-y-auto p-3 xl:block">
        {isLoading && [0, 1, 2].map((item) => <div key={item} className="h-[130px] animate-pulse rounded-xl bg-secondary" />)}
        {!isLoading &&
          portfolios.map((portfolio, index) => (
            <PortfolioRailItem
              key={portfolio.id}
              portfolio={portfolio}
              summary={summaryQueries[index] ?? { data: undefined, isLoading: true }}
              selected={portfolio.id === selectedId}
              index={index}
              total={portfolios.length}
              isReordering={isReordering}
              onSelect={onSelect}
              onMove={onMove}
            />
          ))}
      </div>

      <div className="hidden items-center justify-between gap-3 border-t border-border px-5 py-4 text-table xl:flex">
        <span className="text-table text-subtle">当前持仓市值</span>
        <PortfolioRailTotal summaries={summaryQueries} />
      </div>
    </aside>
  );
}

function PortfolioRailItem({
  portfolio,
  summary,
  selected,
  index,
  total,
  isReordering,
  onSelect,
  onMove,
}: {
  portfolio: Portfolio;
  summary: SummaryQuery;
  selected: boolean;
  index: number;
  total: number;
  isReordering: boolean;
  onSelect: (id: string) => void;
  onMove: (portfolio: Portfolio, direction: -1 | 1) => void;
}) {
  const gain = summary.data?.floating_gain ?? null;
  const gainPercent = summary.data?.floating_gain_percent ?? null;
  const marketValue = summary.data?.total_market_value ?? null;

  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-1 rounded-xl border transition-all duration-200",
        selected
          ? "border-primary/45 bg-primary/[0.10] shadow-[inset_3px_0_0_var(--primary)]"
          : "border-border/45 bg-card-deep/10 hover:border-border hover:bg-secondary/50",
      )}
    >
      <button
        type="button"
        className="min-w-0 flex-1 px-4 py-4 text-left"
        onClick={() => onSelect(portfolio.id)}
        aria-current={selected ? "page" : undefined}
      >
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-body font-semibold tracking-tight text-foreground" title={portfolio.name}>
            {portfolio.name}
          </span>
          <span className={cn("shrink-0 font-mono text-table font-medium", movementClass(gain))}>
            {summary.isLoading || !summary.data ? "—" : formatRailSignedMoney(gain)}
          </span>
        </span>
        <span className="mt-4 flex items-baseline justify-between gap-3">
          <span className="font-mono text-body font-semibold tracking-[-0.04em] text-foreground">
            {summary.isLoading ? "—" : formatRailMoney(marketValue)}
          </span>
          <span className={cn("font-mono text-table font-medium", movementClass(gainPercent))}>
            {summary.isLoading || !summary.data ? "—" : formatPercent(gainPercent)}
          </span>
        </span>
      </button>

      <div className="flex flex-col justify-center gap-1 pr-1">
        <button
          type="button"
          className="grid size-8 place-items-center rounded text-subtle hover:bg-secondary hover:text-foreground disabled:opacity-30"
          onClick={() => void onMove(portfolio, -1)}
          disabled={isReordering || index === 0}
          aria-label={`将${portfolio.name}上移`}
          title="上移"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          className="grid size-8 place-items-center rounded text-subtle hover:bg-secondary hover:text-foreground disabled:opacity-30"
          onClick={() => void onMove(portfolio, 1)}
          disabled={isReordering || index === total - 1}
          aria-label={`将${portfolio.name}下移`}
          title="下移"
        >
          <ArrowDown size={12} />
        </button>
      </div>
    </div>
  );
}

function PortfolioRailTotal({ summaries }: { summaries: SummaryQuery[] }) {
  const total = summaries.reduce((sum, summary) => sum + (summary.data?.total_market_value ?? 0), 0);
  const isLoading = summaries.some((summary) => summary.isLoading);
  const hasValue = summaries.some((summary) => summary.data?.total_market_value !== null && summary.data?.total_market_value !== undefined);

  return (
    <span className="font-mono text-table font-semibold tracking-tight text-foreground">
      {hasValue ? formatRailMoney(total) : isLoading ? "—" : "暂无数据"}
    </span>
  );
}

function formatRailMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `¥${Math.round(value).toLocaleString("zh-CN", { useGrouping: false })}`;
}

function formatRailSignedMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}¥${Math.round(Math.abs(value)).toLocaleString("zh-CN", { useGrouping: false })}`;
}
