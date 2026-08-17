import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Check, Clock3, Info, Minus, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import {
  EMPTY_VALUE,
  formatBp,
  formatDate,
  formatPercent,
  formatSigned,
  formatTime,
  formatValue,
  freshnessLabel,
  materializeItems,
  movement,
  quoteDirection,
  stateLabel,
  stateTone,
  statusTone,
} from "./global-market-formatters";
import { OverviewPanel, PanelState } from "./overview-panel";
import {
  GLOBAL_MARKET_GROUPS,
  catalogForGroup,
  type GlobalMarketGroupData,
  type GlobalMarketGroupKey,
  type GlobalMarketItem,
  type GlobalMarketResponse,
} from "./global-market-types";

function MovementIcon({ value }: { value: number | null }) {
  if (value === null || value === 0) return <Minus size={13} aria-hidden />;
  return value > 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />;
}

function InfoPopover({ item }: { item: GlobalMarketItem }) {
  const [open, setOpen] = useState(false);
  const pointerHovering = useRef(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearOpenTimer = () => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const keepOpen = () => {
    clearCloseTimer();
  };

  const scheduleOpen = () => {
    clearCloseTimer();
    if (open || openTimer.current !== null) return;
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, 80);
  };

  const scheduleClose = () => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, 360);
  };

  const handlePointerEnter = () => {
    pointerHovering.current = true;
    scheduleOpen();
  };

  const handlePointerLeave = () => {
    pointerHovering.current = false;
    scheduleClose();
  };

  const handleContentEnter = () => {
    pointerHovering.current = true;
    keepOpen();
  };

  const handleContentLeave = () => {
    pointerHovering.current = false;
    scheduleClose();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      clearCloseTimer();
      setOpen(true);
      return;
    }
    if (pointerHovering.current) return;
    scheduleClose();
  };

  useEffect(() => () => {
    clearOpenTimer();
    clearCloseTimer();
  });

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground focus-visible:text-foreground"
          aria-label={`查看${item.name}数据说明`}
          title="查看数据说明"
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <Info size={13} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="w-[min(330px,calc(100vw-24px))] p-4"
        onPointerEnter={handleContentEnter}
        onPointerLeave={handleContentLeave}
        onFocus={keepOpen}
        onBlur={scheduleClose}
        onOpenAutoFocus={(event) => {
          if (pointerHovering.current) event.preventDefault();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{item.display_code}</p>
          </div>
          <span className="shrink-0 rounded-full border border-primary/25 bg-primary/[0.08] px-2 py-1 font-mono text-[10px] text-primary">
            {item.provider_type ?? "—"}
          </span>
        </div>
        <dl className="mt-3 space-y-2 text-xs">
          <InfoRow label="供应商代码" value={item.source_symbol} />
          <InfoRow label="适配器版本" value={item.adapter_version} />
          <InfoRow label="能力" value={item.capability} />
          <InfoRow label="数据来源" value={item.origin} />
          <InfoRow label="单位/方向" value={item.quote_direction ?? item.unit} />
          <InfoRow
            label={item.as_of_date ? "数据日期" : "行情时间"}
            value={item.as_of_date ? formatDate(item.as_of_date) : formatTime(item.quoted_at)}
          />
          <InfoRow label="抓取时间" value={formatTime(item.fetched_at)} />
          <InfoRow label="当前映射合约" value={item.mapped_contract} />
          <InfoRow label="数据新鲜度" value={freshnessLabel(item.freshness)} />
          {item.missing_reason ? <InfoRow label="缺失/降级原因" value={item.missing_reason} /> : null}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground/70">{label}</dt>
      <dd className="break-words text-right font-mono text-[11px] text-foreground/85">{value || EMPTY_VALUE}</dd>
    </div>
  );
}

function StatusPill({ item }: { item: GlobalMarketItem }) {
  if (item.market_status === "不适用") return null;

  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 text-[10px]", statusTone(item.market_status))}>
      <span className={cn("size-1.5 rounded-full bg-muted-foreground/45", item.market_status === "交易中" && "bg-success")} />
      {item.market_status}
    </span>
  );
}

function QuoteItem({ item, yieldMode = false }: { item: GlobalMarketItem; yieldMode?: boolean }) {
  const direction = quoteDirection(item);
  const changeValue = yieldMode ? item.change_bp : item.change_percent;
  const hasValue = item.latest !== null;
  return (
    <article
      className={cn(
        "group/quote min-w-0 rounded-xl border border-border/70 bg-background/35 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-secondary/25",
        !hasValue && "opacity-80",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-foreground">{item.name}</p>
          <p className="mt-0.5 font-mono text-[10px] tracking-[0.05em] text-muted-foreground/60">{item.display_code}</p>
        </div>
        <div className="flex items-center gap-1">
          <StatusPill item={item} />
          <InfoPopover item={item} />
        </div>
      </div>

      <div className="mt-2.5 min-w-0">
        <p
          className={cn(
            "truncate font-mono text-[22px] font-medium leading-none tracking-[-0.04em]",
            hasValue ? movement(changeValue) : "text-muted-foreground",
          )}
        >
          {formatValue(item.latest, item.precision)}
        </p>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[10px] text-muted-foreground/65">{yieldMode ? item.unit : (direction ?? item.unit)}</p>
          <div className={cn("flex shrink-0 items-center gap-1 font-mono text-[11px]", movement(changeValue))}>
            <MovementIcon value={changeValue} />
            <span>
              {yieldMode ? formatBp(item.change_bp) : `${formatSigned(item.change, item.precision)}  ${formatPercent(item.change_percent)}`}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[10px] text-muted-foreground/60">
        <span className="truncate">{yieldMode ? `截至 ${formatDate(item.as_of_date)}` : freshnessLabel(item.freshness)}</span>
        <span className="shrink-0 font-mono">{yieldMode ? "日频" : formatTime(item.quoted_at || item.fetched_at)}</span>
      </div>
      {item.missing_reason ? (
        <p className="mt-2 truncate text-[10px] text-warning" title={item.missing_reason}>
          {item.missing_reason}
        </p>
      ) : null}
    </article>
  );
}

function LoadingItems({ group }: { group: GlobalMarketGroupKey }) {
  return (
    <div
      className={cn(
        "grid gap-2.5 p-3.5 sm:p-4",
        group === "fx"
          ? "grid-cols-1 min-[520px]:grid-cols-3"
          : group === "yields" || group === "commodities"
            ? "grid-cols-1 min-[520px]:grid-cols-2 min-[1100px]:grid-cols-4"
            : "grid-cols-1 min-[520px]:grid-cols-2 min-[820px]:grid-cols-3",
      )}
    >
      {catalogForGroup(group).map((item) => (
        <div key={item.id} className="rounded-xl border border-border/60 bg-background/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-28 animate-pulse rounded bg-secondary" />
            <div className="size-3 animate-pulse rounded-full bg-secondary" />
          </div>
          <div className="mt-4 h-6 w-24 animate-pulse rounded bg-secondary" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-secondary/70" />
        </div>
      ))}
    </div>
  );
}

function IndicesBody({ items }: { items: GlobalMarketItem[] }) {
  return (
    <div className="space-y-2.5 p-3.5 sm:p-4">
      {(["亚洲", "美国"] as const).map((subgroup) => (
        <section key={subgroup}>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-px flex-1 bg-border/70" />
            <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground/65">{subgroup}</span>
            <span className="h-px flex-1 bg-border/70" />
          </div>
          <div className="grid grid-cols-1 gap-2.5 min-[520px]:grid-cols-2 min-[820px]:grid-cols-3">
            {items
              .filter((item) => item.subgroup === subgroup)
              .map((item) => (
                <QuoteItem key={item.id} item={item} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FxBody({ items }: { items: GlobalMarketItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 p-3.5 min-[520px]:grid-cols-3">
      {items.map((item) => (
        <QuoteItem key={item.id} item={item} />
      ))}
    </div>
  );
}

function CommoditiesBody({ items }: { items: GlobalMarketItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 p-3.5 sm:p-4 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-4">
      {(["伦敦现货", "纽约期货", "国内期货", "能源"] as const).map((subgroup) => (
        <section key={subgroup} className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/65">{subgroup}</span>
            <span className="h-px flex-1 bg-border/70" />
          </div>
          <div className="grid gap-2.5">
            {items
              .filter((item) => item.subgroup === subgroup)
              .map((item) => (
                <QuoteItem key={item.id} item={item} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function YieldsBody({ items }: { items: GlobalMarketItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 p-3.5 sm:p-4 min-[520px]:grid-cols-2 min-[1100px]:grid-cols-4">
      {items.map((item) => (
        <QuoteItem key={item.id} item={item} yieldMode />
      ))}
    </div>
  );
}

function GroupBody({ group, items }: { group: GlobalMarketGroupKey; items: GlobalMarketItem[] }) {
  if (group === "indices") return <IndicesBody items={items} />;
  if (group === "fx") return <FxBody items={items} />;
  if (group === "commodities") return <CommoditiesBody items={items} />;
  return <YieldsBody items={items} />;
}

function GroupCard({
  group,
  data,
  query,
  isRefreshing,
  onRefresh,
}: {
  group: (typeof GLOBAL_MARKET_GROUPS)[number];
  data: GlobalMarketGroupData | undefined;
  query: UseQueryResult<GlobalMarketResponse, Error>;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const items = materializeItems(group.key, data);
  const isLoading = query.isPending;
  const state = data?.state ?? "unavailable";
  return (
    <OverviewPanel
      title={group.title}
      label={group.label}
      updatedAt={data?.updated_at}
      stale={state === "stale"}
      isFetching={query.isFetching || Boolean(data?.is_fetching) || isRefreshing}
      className="min-w-0 h-fit self-start"
      bodyClassName="flex-none"
      toolbar={
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 text-[10px]", stateTone(state))}>
            {state === "ready" ? (
              <Check size={12} />
            ) : state === "stale" ? (
              <Clock3 size={12} />
            ) : state === "partial" ? (
              <TriangleAlert size={12} />
            ) : (
              <WifiOff size={12} />
            )}
            <span>{isLoading ? "读取中" : stateLabel(state)}</span>
            {data ? (
              <span className="font-mono text-muted-foreground/55">
                {data.available_count}/{data.expected_count}
              </span>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-md"
            onClick={onRefresh}
            disabled={isRefreshing || Boolean(data?.is_fetching)}
            aria-label={`同步${group.title}数据`}
            title={`同步${group.title}数据`}
          >
            <RefreshCw size={13} className={isRefreshing || data?.is_fetching ? "animate-spin" : undefined} />
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <LoadingItems group={group.key} />
      ) : query.isError || !data ? (
        <PanelState kind="error" message="全球市场聚合数据暂时无法读取" className="min-h-[236px]" />
      ) : (
        <GroupBody group={group.key} items={items} />
      )}
    </OverviewPanel>
  );
}

function GlobalMarketToolbar({
  data,
  query,
}: {
  data: GlobalMarketResponse | undefined;
  query: UseQueryResult<GlobalMarketResponse, Error>;
}) {
  const allUnavailable = data && Object.values(data.groups).every((group) => group.state === "unavailable");
  return (
    <div className="contents">
      {query.isError && !data ? (
        <div
          className="flex items-start gap-3 border-l-2 border-danger bg-danger/[0.07] px-4 py-3 text-xs text-muted-foreground"
          role="alert"
        >
          <WifiOff size={15} className="mt-0.5 shrink-0 text-danger" />
          <p>全球市场聚合接口暂时无法读取，请稍后重试。</p>
        </div>
      ) : !data?.enabled ? (
        <div
          className="flex items-start gap-3 border-l-2 border-warning bg-warning/[0.07] px-4 py-3 text-xs text-muted-foreground"
          role="status"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warning" />
          <p>{data?.message ?? "全球市场功能尚未启用，请由部署配置开启 AKShare 全局快照。"}</p>
        </div>
      ) : allUnavailable ? (
        <div
          className="flex items-start gap-3 border-l-2 border-danger bg-danger/[0.07] px-4 py-3 text-xs text-muted-foreground"
          role="alert"
        >
          <WifiOff size={15} className="mt-0.5 shrink-0 text-danger" />
          <p>{data.message ?? "当前没有可读取的全球市场快照，后台任务恢复后会自动显示。"}</p>
        </div>
      ) : null}
    </div>
  );
}

export function GlobalMarketPanel({
  query,
  refreshingGroups,
  onRefreshGroup,
}: {
  query: UseQueryResult<GlobalMarketResponse, Error>;
  refreshingGroups: Partial<Record<GlobalMarketGroupKey, boolean>>;
  onRefreshGroup: (group: GlobalMarketGroupKey) => void;
}) {
  return (
    <section aria-label="全球市场行情">
      <GlobalMarketToolbar data={query.data} query={query} />
      <div className="grid min-w-0 grid-cols-1 items-start gap-4">
        {GLOBAL_MARKET_GROUPS.map((group) => (
          <GroupCard
            key={group.key}
            group={group}
            data={query.data?.groups[group.key]}
            query={query}
            isRefreshing={Boolean(refreshingGroups[group.key])}
            onRefresh={() => onRefreshGroup(group.key)}
          />
        ))}
      </div>
    </section>
  );
}
