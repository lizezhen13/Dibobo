import type { ColumnDef } from "@tanstack/react-table";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookmarkMinus,
  BookmarkPlus,
  Clock3,
  Database,
  FileText,
  LoaderCircle,
  Radar,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { DataTable } from "../../components/data-table";
import { EmptyState, ErrorState, InlineAlert, PageContainer, Pagination } from "../../components/patterns";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ApiError } from "../../lib/api";
import { formatDateTime, formatPercent, formatPoint, movementClass } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import {
  RADAR_PAGE_SIZE,
  useAddRadarWatchlistMutation,
  useRadarDailyQuery,
  useRadarSearchMutation,
  useRemoveRadarWatchlistMutation,
} from "./queries";
import type { RadarFilters, RadarItem, RadarResponse } from "./types";
import "./radar.css";

const DEFAULT_FILTERS = {
  market_cap_min: 800,
  market_cap_max: null,
  dividend_yield_min: 4,
  dividend_yield_max: null,
  pb_min: null,
  pb_max: null,
  pe_min: null,
  pe_max: null,
} satisfies RadarFilters;

function formatMetric(value: number | null, suffix = ""): string {
  return value === null ? "—" : formatPoint(value, { group: false }) + suffix;
}

function formatYield(value: number | null): string {
  return value === null ? "—" : value.toFixed(2) + "%";
}

function Movement({ value }: { value: number | null }) {
  if (value === null) return <span className="numeric text-muted-foreground">—</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Activity;
  return (
    <span className={cn("inline-flex items-center gap-1 numeric", movementClass(value))}>
      <Icon size={13} aria-hidden="true" />
      {formatPercent(value)}
    </span>
  );
}

function createRadarColumns({
  watchlistOverrides,
  pendingCode,
  onAdd,
  onRemove,
  onDetails,
}: {
  watchlistOverrides: Record<string, boolean>;
  pendingCode: string | null;
  onAdd: (item: RadarItem) => void;
  onRemove: (item: RadarItem) => void;
  onDetails: (item: RadarItem) => void;
}): ColumnDef<RadarItem, unknown>[] {
  return [
    {
      id: "security",
      header: "标的名称",
      meta: { sticky: "left", headerClassName: "min-w-[190px]", cellClassName: "min-w-[190px]" },
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex min-w-[190px] items-center justify-center">
            <div className="min-w-0 text-center">
              <div className="truncate text-[13px] font-semibold text-foreground">{item.name}</div>
              <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-[13px] tracking-[0.04em] text-muted-foreground/60">
                <span>{item.ticker}</span>
                <span className="rounded-md border border-border/80 bg-secondary px-1.5 py-0.5 text-[11px] leading-none tracking-[0.08em] text-muted-foreground">
                  {item.exchange}
                </span>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: "latest",
      header: "最新 / 涨跌",
      meta: { align: "center", headerClassName: "min-w-[156px]", cellClassName: "min-w-[156px]" },
      cell: ({ row }) => (
        <div>
          <div className="numeric text-[0.88rem] text-foreground">{formatMetric(row.original.latest)}</div>
          <div className="mt-1 text-caption">
            <Movement value={row.original.change_percent} />
          </div>
        </div>
      ),
    },
    {
      accessorKey: "market_cap",
      header: "市值 · 亿",
      meta: { align: "center", headerClassName: "min-w-[136px]", cellClassName: "min-w-[136px]" },
      cell: ({ row }) => <span className="numeric">{formatMetric(row.original.market_cap)}</span>,
    },
    {
      accessorKey: "dividend_yield",
      header: "股息率",
      meta: { align: "center", headerClassName: "min-w-[136px]", cellClassName: "min-w-[136px]" },
      cell: ({ row }) => (
        <span className={cn("numeric font-semibold", row.original.dividend_yield !== null ? "text-primary" : "text-muted-foreground")}>
          {formatYield(row.original.dividend_yield)}
        </span>
      ),
    },
    {
      accessorKey: "pb",
      header: "PB",
      meta: { align: "center", headerClassName: "min-w-[120px]", cellClassName: "min-w-[120px]" },
      cell: ({ row }) => <span className="numeric">{formatMetric(row.original.pb)}</span>,
    },
    {
      accessorKey: "pe_ttm",
      header: "PE / TTM",
      meta: { align: "center", headerClassName: "min-w-[136px]", cellClassName: "min-w-[136px]" },
      cell: ({ row }) => <span className="numeric">{formatMetric(row.original.pe_ttm)}</span>,
    },
    {
      id: "industry",
      header: "所属行业",
      meta: { align: "center", headerClassName: "min-w-[176px]", cellClassName: "min-w-[176px]" },
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.industry ?? "—"}</span>,
    },
    {
      id: "actions",
      header: "操作",
      meta: { sticky: "right", headerClassName: "min-w-[144px]", cellClassName: "min-w-[144px]" },
      cell: ({ row }) => {
        const item = row.original;
        const isAdded = watchlistOverrides[item.thscode] ?? item.in_watchlist;
        const isPending = pendingCode === item.thscode;
        return (
          <div className="flex justify-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              className={cn(
                "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                isAdded && "text-danger hover:bg-danger/10 hover:text-danger",
              )}
              disabled={isPending}
              onClick={() => (isAdded ? onRemove(item) : onAdd(item))}
              aria-label={isPending ? "正在处理" : isAdded ? "移出自选" : "添加自选"}
              title={isPending ? "正在处理" : isAdded ? "移出自选" : "添加自选"}
            >
              {isPending ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : isAdded ? (
                <BookmarkMinus size={15} />
              ) : (
                <BookmarkPlus size={15} />
              )}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => onDetails(item)}
              aria-label={"查看" + item.name + "详情"}
              title="查看详情"
            >
              <FileText size={15} />
            </Button>
          </div>
        );
      },
    },
  ];
}

export function RadarPage() {
  const [page, setPage] = useState(1);
  const [manualData, setManualData] = useState<RadarResponse | null>(null);
  const [watchlistOverrides, setWatchlistOverrides] = useState<Record<string, boolean>>({});
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  const dailyQuery = useRadarDailyQuery(page, RADAR_PAGE_SIZE);
  const searchMutation = useRadarSearchMutation();
  const addMutation = useAddRadarWatchlistMutation();
  const removeMutation = useRemoveRadarWatchlistMutation();
  const navigate = useNavigate();
  const response = manualData ?? dailyQuery.data;
  const totalPages = response ? Math.max(1, Math.ceil(response.total / response.page_size)) : 1;

  const summaryText = useMemo(() => {
    if (!response) return "正在读取最近一次默认快照";
    if (response.result_type === "manual") return "本次命中 " + response.total + " 只股票";
    if (response.snapshot_status === "never") return "今日默认快照尚未生成";
    return "策略共命中 " + response.total + " 只股票";
  }, [response]);

  const addToWatchlist = (item: RadarItem) => {
    setWatchlistError(null);
    addMutation.mutate(
      { thscode: item.thscode, name: item.name, industry: item.industry },
      {
        onSuccess: () => {
          setWatchlistOverrides((current) => ({ ...current, [item.thscode]: true }));
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409) {
            setWatchlistOverrides((current) => ({ ...current, [item.thscode]: true }));
            return;
          }
          setWatchlistError(error instanceof ApiError ? error.message : "添加自选失败，请稍后重试");
        },
      },
    );
  };

  const removeFromWatchlist = (item: RadarItem) => {
    setWatchlistError(null);
    removeMutation.mutate(
      { thscode: item.thscode },
      {
        onSuccess: () => {
          setWatchlistOverrides((current) => ({ ...current, [item.thscode]: false }));
        },
        onError: (error) => {
          setWatchlistError(error instanceof ApiError ? error.message : "移出自选失败，请稍后重试");
        },
      },
    );
  };

  const runDefaultScan = (targetPage = 1) => {
    setPage(targetPage);
    searchMutation.mutate(
      { filters: DEFAULT_FILTERS, page: targetPage, page_size: RADAR_PAGE_SIZE },
      { onSuccess: (next) => setManualData(next) },
    );
  };

  const sourceNotReady = response?.data_source.state !== undefined && response.data_source.state !== "ready";
  const resultLoading = searchMutation.isPending || (dailyQuery.isLoading && !dailyQuery.data);
  const radarColumns = createRadarColumns({
    watchlistOverrides,
    pendingCode: addMutation.isPending
      ? (addMutation.variables?.thscode ?? null)
      : removeMutation.isPending
        ? (removeMutation.variables?.thscode ?? null)
        : null,
    onAdd: addToWatchlist,
    onRemove: removeFromWatchlist,
    onDetails: (item) => navigate("/radar/detail/" + encodeURIComponent(item.ticker)),
  });
  return (
    <PageContainer size="wide" className="radar-page flex min-h-0 flex-col overflow-hidden">
      <Card className="radar-strategy-card shrink-0 animate-fade-in-up">
        <div className="radar-strategy-grid" aria-hidden="true" />
        <div className="radar-strategy-sweep" aria-hidden="true" />
        <div className="relative z-10 grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 font-mono text-caption tracking-[0.18em] text-primary/80">
              <span className="radar-signal-dot" aria-hidden="true" /> DEFAULT STRATEGY / DAILY 15:30
            </div>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-[-0.04em] text-foreground sm:text-3xl">
              <span className="text-primary">时间会证明红利低波策略</span>
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">央企/国企+行业龙头+高市值，股息率 4% 以上且连续稳定分红</p>
          </div>
          <div className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="font-mono text-caption tracking-[0.14em] text-muted-foreground/60">MARKET CAP FLOOR</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="numeric text-3xl font-semibold tracking-[-0.08em] text-foreground">800</span>
              <span className="text-sm text-muted-foreground">亿</span>
            </div>
          </div>
          <div className="border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="font-mono text-caption tracking-[0.14em] text-muted-foreground/60">DIVIDEND FLOOR</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="numeric text-3xl font-semibold tracking-[-0.08em] text-primary">4.00</span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </Card>

      {sourceNotReady && (
        <InlineAlert tone="warning" className="mt-5 flex shrink-0 items-center justify-between gap-4">
          <span>{response?.data_source.message ?? "请先在系统设置中配置并启用 Longbridge"}</span>
          <Button asChild variant="outline" size="xs">
            <Link to="/settings">前往设置</Link>
          </Button>
        </InlineAlert>
      )}
      {response?.stale && response.daily_snapshot_error && (
        <InlineAlert tone="warning" className="mt-5 flex shrink-0 items-center gap-2">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>默认策略最近一次刷新失败：{response.daily_snapshot_error}</span>
        </InlineAlert>
      )}
      {searchMutation.error && (
        <InlineAlert tone="danger" className="mt-5 flex shrink-0 items-center gap-2">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{searchMutation.error instanceof ApiError ? searchMutation.error.message : "默认策略扫描失败，请稍后重试"}</span>
        </InlineAlert>
      )}
      {watchlistError && (
        <InlineAlert tone="danger" className="mt-5 flex shrink-0 items-center gap-2">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{watchlistError}</span>
        </InlineAlert>
      )}

      <section className="mt-8 flex min-h-0 flex-1 flex-col" aria-labelledby="radar-results-title">
        <DataTable
          columns={radarColumns}
          data={response?.items ?? []}
          isLoading={resultLoading}
          getRowId={(item) => item.thscode}
          stickyHeader
          centered
          className="min-h-0 flex-1"
          ariaLabelledBy="radar-results-title"
          toolbarClassName="!bg-secondary/25"
          tableClassName="!min-w-[1240px] border-separate border-spacing-0 whitespace-nowrap text-center"
          headerClassName="!bg-secondary"
          toolbar={
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id="radar-results-title" className="font-display text-base font-semibold tracking-tight text-foreground">
                    高股息标的
                  </h2>
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground/65">
                    <Clock3 size={13} aria-hidden="true" />
                    {response?.generated_at ? "数据时间 " + formatDateTime(response.generated_at) : "尚无生成时间"}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground/65">{summaryText}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 text-caption text-muted-foreground/65">
                <Button size="sm" onClick={() => runDefaultScan()} disabled={resultLoading}>
                  <Radar size={15} /> 开始扫描
                </Button>
              </div>
            </div>
          }
          empty={
            dailyQuery.isError && !dailyQuery.data && !searchMutation.isPending ? (
              <ErrorState
                title="默认快照读取失败"
                description={dailyQuery.error instanceof ApiError ? dailyQuery.error.message : "请稍后重试。"}
                onRetry={() => void dailyQuery.refetch()}
                className="min-h-64 rounded-none border-0 bg-transparent shadow-none"
              />
            ) : sourceNotReady ? (
              <EmptyState
                icon={Database}
                title="还没有可用的 Longbridge 数据"
                description="配置并启用 Longbridge 后，系统会在每日 15:30 生成默认快照；也可以点击“开始扫描”立即执行一次。"
                className="min-h-64 rounded-none border-0 bg-transparent shadow-none"
              />
            ) : (
              <EmptyState
                icon={Radar}
                title="默认策略没有命中股票"
                description="当前默认策略没有命中股票，可以点击“开始扫描”再次获取最新数据。"
                action={
                  <Button size="sm" onClick={() => runDefaultScan()} disabled={resultLoading}>
                    <Radar size={14} /> 执行默认策略
                  </Button>
                }
                className="min-h-64 rounded-none border-0 bg-transparent shadow-none"
              />
            )
          }
          pagination={
            response && response.items.length > 0 ? (
              <Pagination
                page={response.page}
                totalPages={totalPages}
                onPageChange={(nextPage) => {
                  if (manualData) runDefaultScan(nextPage);
                  else setPage(nextPage);
                }}
                pageStart={(response.page - 1) * response.page_size + 1}
                pageEnd={Math.min(response.page * response.page_size, response.total)}
                totalItems={response.total}
                isLoading={resultLoading}
                compact
                alwaysVisible
                className="shrink-0"
              />
            ) : undefined
          }
        />
      </section>
    </PageContainer>
  );
}
