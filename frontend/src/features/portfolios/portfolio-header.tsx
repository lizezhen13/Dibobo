import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Edit3, Layers3, RefreshCw, Star, Trash2 } from "lucide-react";

import { InlineAlert } from "../../components/patterns";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ApiError } from "../../lib/api";
import { formatMoney, formatPercent, movementClass } from "../../lib/formatters";
import { Metric } from "../../components/patterns/metric";
import { cardVariants } from "../../components/ui/card";
import { cn } from "../../lib/utils";
import type { HoldingSummary, Portfolio } from "../holdings/types";

export function PortfolioHeader({
  portfolio,
  marketStatus,
  summary,
  isSummaryLoading,
  onRefresh,
  isRefreshing,
  onEdit,
  onDelete,
  onSetDefault,
  isSettingDefault,
  error,
}: {
  portfolio: Portfolio;
  marketStatus: string;
  summary?: HoldingSummary;
  isSummaryLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  isSettingDefault: boolean;
  error: Error | null;
}) {
  return (
    <section className={cn(cardVariants({ variant: "raised", interactive: false }), "relative shrink-0 overflow-hidden px-6 py-6 sm:px-7")}>
      <div className="pointer-events-none absolute -right-8 -top-16 size-48 rounded-full border border-primary/10" />
      <div className="pointer-events-none absolute -right-2 -top-10 size-32 rounded-full border border-primary/10" />
      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
              <Layers3 size={19} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-heading tracking-tight text-foreground">{portfolio.name}</h2>
                {portfolio.is_default && (
                  <Badge variant="neutral" className="border-primary/25 bg-primary/10 text-primary-text">
                    <Star size={11} className="fill-current" /> 默认组合
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex items-center gap-2 text-label tracking-[0.08em] text-subtle">
                <span className="size-1.5 rounded-full bg-primary" />
                {marketStatus === "交易中" ? "LIVE QUOTES" : "MARKET CLOSED"} · {marketStatus}
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-body-sm leading-7 text-muted-foreground">
            {portfolio.note || "这个组合还没有备注。可以记录策略、账户用途或观察重点。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn(isRefreshing && "animate-spin")} size={14} /> 刷新行情
          </Button>
          {!portfolio.is_default && (
            <Button variant="outline" size="sm" onClick={onSetDefault} disabled={isSettingDefault}>
              <Star size={14} /> 设为默认
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit3 size={14} /> 编辑
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-danger/40 text-danger hover:border-danger/65 hover:bg-danger/10 hover:text-danger"
            onClick={onDelete}
          >
            <Trash2 size={14} /> 删除
          </Button>
        </div>
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-x-5 gap-y-5 border-t border-border pt-5 sm:grid-cols-3 min-[1800px]:grid-cols-6">
        <Metric
          label="当前持仓"
          value={summary ? `${summary.holding_count} 只` : "—"}
          icon={Layers3}
          iconClass="text-sky-300"
          isLoading={isSummaryLoading}
        />
        <Metric
          label="当前持仓市值"
          value={summary ? formatMoney(summary.total_market_value) : "—"}
          icon={CircleDollarSign}
          iconClass="text-emerald-300"
          isLoading={isSummaryLoading}
        />
        <Metric
          label="浮动盈亏"
          value={summary ? formatMoney(summary.floating_gain) : "—"}
          icon={summary && (summary.floating_gain ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.floating_gain ?? null)}
          valueClass={movementClass(summary?.floating_gain ?? null)}
          isLoading={isSummaryLoading}
        />
        <Metric
          label="浮动盈亏率"
          value={summary ? formatPercent(summary.floating_gain_percent) : "—"}
          icon={summary && (summary.floating_gain_percent ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.floating_gain_percent ?? null)}
          valueClass={movementClass(summary?.floating_gain_percent ?? null)}
          isLoading={isSummaryLoading}
        />
        <Metric
          label={summary?.realized_incomplete ? "已实现盈亏（待补录）" : "已实现盈亏"}
          value={summary ? formatMoney(summary.realized_gain) : "—"}
          icon={summary && (summary.realized_gain ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.realized_gain ?? null)}
          valueClass={movementClass(summary?.realized_gain ?? null)}
          isLoading={isSummaryLoading}
        />
        <Metric
          label="累计总盈亏"
          value={summary ? formatMoney(summary.total_gain) : "—"}
          icon={summary && (summary.total_gain ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.total_gain ?? null)}
          valueClass={movementClass(summary?.total_gain ?? null)}
          isLoading={isSummaryLoading}
        />
      </div>
      {error && <InlineAlert className="relative mt-4">{mutationErrorMessage(error)}</InlineAlert>}
    </section>
  );
}

function mutationErrorMessage(error: Error | null): string {
  return error instanceof ApiError ? error.message : "操作失败，请稍后重试";
}
