import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CircleDashed,
  DatabaseZap,
  Filter,
  Info,
  LoaderCircle,
  Radar,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DataTable } from "../../components/data-table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { formatDateTime, formatPercent, formatPoint, movementClass } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import {
  useRadarQuotesQuery,
  useRadarSearchMutation,
  useRadarStatusQuery,
  useStartRadarSyncMutation,
} from "./queries";
import type {
  RadarFilters,
  RadarResultItem,
  RadarSearchPayload,
  RadarSearchResult,
  RadarSortField,
  RadarStatus,
  SortDirection,
} from "./types";

type FilterKey = keyof RadarFilters;
type FilterDraft = Record<FilterKey, { minimum: string; maximum: string }>;

const EMPTY_FILTERS: FilterDraft = {
  total_market_cap: { minimum: "", maximum: "" },
  dividend_yield_ttm: { minimum: "", maximum: "" },
  pb_mrq: { minimum: "", maximum: "" },
  roe_weighted: { minimum: "", maximum: "" },
};

const FILTER_META: Array<{
  key: FilterKey;
  ordinal: string;
  label: string;
  unit: string;
  hint: string;
  placeholder: [string, string];
}> = [
  {
    key: "total_market_cap",
    ordinal: "01",
    label: "总市值",
    unit: "亿元",
    hint: "标准化总市值，不以流通市值替代",
    placeholder: ["例如 100", "例如 2,000"],
  },
  {
    key: "dividend_yield_ttm",
    ordinal: "02",
    label: "近 12 个月股息率",
    unit: "%",
    hint: "税前现金分红 ÷ 筛选时点最新价",
    placeholder: ["例如 3", "例如 12"],
  },
  {
    key: "pb_mrq",
    ordinal: "03",
    label: "市净率 PB",
    unit: "倍",
    hint: "MRQ 口径；负值按数据源原值保留",
    placeholder: ["例如 0", "例如 2.5"],
  },
  {
    key: "roe_weighted",
    ordinal: "04",
    label: "加权平均 ROE",
    unit: "%",
    hint: "最新有效财报期；百分数原值",
    placeholder: ["例如 8", "例如 35"],
  },
];

export function RadarPage() {
  const statusQuery = useRadarStatusQuery();
  const startSync = useStartRadarSyncMutation();
  const searchMutation = useRadarSearchMutation();
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<RadarSearchResult | null>(null);
  const quotes = useRadarQuotesQuery(result?.search_id ?? null, result?.page ?? 1);

  const quoteMap = useMemo(
    () => new Map((quotes.data?.items ?? []).map((item) => [item.thscode, item])),
    [quotes.data?.items],
  );
  const liveItems = useMemo(
    () =>
      (result?.items ?? []).map((item) => {
        const quote = quoteMap.get(item.thscode);
        return quote
          ? {
              ...item,
              latest: quote.latest,
              change_percent: quote.change_percent,
              quoted_at: quote.quoted_at,
            }
          : item;
      }),
    [quoteMap, result?.items],
  );

  const runSearch = (
    options: Partial<Pick<RadarSearchPayload, "page" | "sort_by" | "sort_direction">> = {},
    preserveSnapshot = false,
  ) => {
    const filters = parseFilters(draft);
    if (typeof filters === "string") {
      setValidationError(filters);
      return;
    }
    setValidationError(null);
    const payload: RadarSearchPayload = {
      filters,
      page: options.page ?? 1,
      page_size: 20,
      sort_by: options.sort_by ?? result?.sort_by ?? "dividend_yield_ttm",
      sort_direction: options.sort_direction ?? result?.sort_direction ?? "desc",
      ...(preserveSnapshot && result ? { search_id: result.search_id } : {}),
    };
    searchMutation.mutate(payload, { onSuccess: setResult });
  };

  const changeSort = (field: RadarSortField) => {
    if (!result) return;
    const direction: SortDirection =
      result.sort_by === field && result.sort_direction === "desc" ? "asc" : "desc";
    runSearch({ page: 1, sort_by: field, sort_direction: direction }, true);
  };

  const columns = useMemo(
    () => createColumns(result, changeSort),
    // changeSort intentionally follows the latest result state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  );

  const status = statusQuery.data;
  const canSync = status && !["not_configured", "unsupported"].includes(status.state);

  return (
    <div className="mx-auto w-full max-w-[1580px] animate-enter">
      <div className="mb-8 flex items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3">
            <p className="eyebrow text-primary/90">DIVIDEND RADAR / 红利雷达</p>
            <span className="h-px w-8 bg-primary/40" />
            <span className="font-mono text-[0.62rem] tracking-[0.14em] text-muted-foreground/50">
              A-SHARE UNIVERSE
            </span>
          </div>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">
            在不完整的数据里，保留诚实的答案
          </h1>
          <p className="mt-2.5 max-w-3xl text-[0.95rem] leading-relaxed text-muted-foreground">
            以总市值、股息率、PB 与 ROE 交叉筛选沪深北 A 股；缺失指标不被误判为失败，而是留在结果末端供你复核。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            <RefreshCw className={cn(statusQuery.isFetching && "animate-spin")} size={13} />
            刷新状态
          </Button>
          {canSync && (
            <Button
              size="sm"
              onClick={() => startSync.mutate()}
              disabled={startSync.isPending || status?.state === "syncing"}
            >
              {status?.state === "syncing" ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <DatabaseZap size={14} />
              )}
              {status?.state === "syncing" ? "同步进行中" : "同步最新快照"}
            </Button>
          )}
        </div>
      </div>

      <RadarStatusPanel
        status={status}
        isLoading={statusQuery.isPending}
        isError={statusQuery.isError}
        onRetry={() => void statusQuery.refetch()}
      />
      {startSync.isError && (
        <div className="mt-3 flex items-center gap-2 border-l-2 border-danger bg-danger/8 px-4 py-2.5 text-[0.8rem] text-danger">
          <AlertTriangle size={14} /> {startSync.error.message}
        </div>
      )}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_330px] gap-5">
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-raised">
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal size={16} />
              </span>
              <div>
                <h2 className="font-display text-[1.25rem] tracking-tight">筛选矩阵</h2>
                <p className="mt-0.5 text-[0.78rem] text-muted-foreground">
                  所有已填写条件以 AND 连接 · 区间包含边界
                </p>
              </div>
            </div>
            <span className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground/40">
              FILTER PROTOCOL 01
            </span>
          </div>

          <div className="grid grid-cols-2">
            {FILTER_META.map((meta, index) => {
              const disabled =
                !status?.can_search ||
                (meta.key === "total_market_cap" && !status.total_market_cap_supported);
              return (
                <RangeField
                  key={meta.key}
                  meta={meta}
                  value={draft[meta.key]}
                  disabled={disabled}
                  unsupported={
                    meta.key === "total_market_cap" &&
                    Boolean(status?.can_search) &&
                    !status?.total_market_cap_supported
                  }
                  className={cn(
                    index % 2 === 0 && "border-r border-border",
                    index < 2 && "border-b border-border",
                  )}
                  onChange={(side, value) =>
                    setDraft((current) => ({
                      ...current,
                      [meta.key]: { ...current[meta.key], [side]: value },
                    }))
                  }
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border bg-card-deep px-6 py-4">
            <div>
              {validationError && (
                <p className="flex items-center gap-2 text-[0.8rem] text-danger">
                  <AlertTriangle size={14} /> {validationError}
                </p>
              )}
              {searchMutation.isError && (
                <p className="flex items-center gap-2 text-[0.8rem] text-danger">
                  <AlertTriangle size={14} /> {searchMutation.error.message}
                </p>
              )}
              {!validationError && !searchMutation.isError && (
                <p className="flex items-center gap-2 text-[0.75rem] text-muted-foreground/60">
                  <Info size={13} /> 空值表示不限制；已知值不满足会被排除
                </p>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(EMPTY_FILTERS);
                  setValidationError(null);
                }}
              >
                <RotateCcw size={13} /> 重置条件
              </Button>
              <Button
                size="sm"
                onClick={() => runSearch({}, false)}
                disabled={!status?.can_search || searchMutation.isPending}
              >
                {searchMutation.isPending ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <ScanSearch size={14} />
                )}
                {result ? "重新筛选" : "开始筛选"}
              </Button>
            </div>
          </div>
        </section>

        <aside className="rounded-xl border border-border bg-card p-6 shadow-raised">
          <p className="eyebrow text-primary/80">THREE-STATE LOGIC</p>
          <h2 className="mt-2 font-display text-xl tracking-tight">三值判定协议</h2>
          <div className="mt-6 space-y-5">
            <LogicStep
              ordinal="A"
              title="满足"
              description="有值且位于区间内，保留。"
              color="bg-success"
            />
            <LogicStep
              ordinal="B"
              title="不满足"
              description="任一有值指标越界，排除。"
              color="bg-danger"
            />
            <LogicStep
              ordinal="?"
              title="未知"
              description="参与筛选的指标缺失，保留并置于完整结果之后。"
              color="bg-warning"
            />
          </div>
          <div className="mt-7 border-t border-border pt-5">
            <div className="flex items-center justify-between text-[0.75rem] text-muted-foreground">
              <span>默认排序</span>
              <span className="font-mono text-foreground/80">股息率 ↓</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[0.75rem] text-muted-foreground">
              <span>结果快照</span>
              <span className="font-mono text-foreground/80">24H</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[0.75rem] text-muted-foreground">
              <span>行情刷新</span>
              <span className="font-mono text-foreground/80">交易中 5S</span>
            </div>
          </div>
        </aside>
      </div>

      <section className="mt-8">
        <ResultHeading result={result} quotes={quotes.data} />
        {quotes.data?.stale && (
          <div className="mb-3 flex items-center gap-2 border-l-2 border-warning bg-warning/8 px-4 py-2.5 text-[0.8rem] text-warning">
            <AlertTriangle size={14} /> 当前行情刷新失败，表格保留最后成功行情。
          </div>
        )}
        <DataTable
          columns={columns}
          data={liveItems}
          isLoading={searchMutation.isPending && !result}
          getRowId={(item) => item.thscode}
          empty={<ResultEmpty hasSearch={Boolean(result)} canSearch={Boolean(status?.can_search)} />}
        />
        {result && result.total > 0 && (
          <Pagination
            result={result}
            pending={searchMutation.isPending}
            onPage={(page) => runSearch({ page }, true)}
          />
        )}
      </section>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4 font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground/50">
        <span>UNIVERSE · 沪 / 深 / 北 A 股 · 排除 ST、退市整理与无有效行情标的</span>
        <span>仅作条件筛选 · 不构成评分、推荐或投资建议</span>
      </div>
    </div>
  );
}

function RadarStatusPanel({
  status,
  isLoading,
  isError,
  onRetry,
}: {
  status?: RadarStatus;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <div className="h-[148px] animate-pulse rounded-xl border border-border bg-card" />;
  }
  if (isError || !status) {
    return (
      <div className="flex min-h-[148px] items-center justify-between rounded-xl border border-border bg-card px-7 shadow-raised">
        <div className="flex items-center gap-4">
          <span className="grid size-10 place-items-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle size={17} />
          </span>
          <div>
            <h2 className="font-display text-lg tracking-tight">雷达状态加载失败</h2>
            <p className="mt-1 text-[0.8rem] text-muted-foreground">请检查本地服务后重试。</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw size={13} /> 重新加载
        </Button>
      </div>
    );
  }
  const readyLike = status.can_search;
  const stateLabel: Record<RadarStatus["state"], string> = {
    not_configured: "未配置",
    not_synced: "待同步",
    syncing: "同步中",
    ready: "快照可用",
    partial_failed: "沿用旧快照",
    failed: "同步失败",
    unsupported: "暂不支持",
  };
  const tone = status.state === "failed" ? "danger" : status.state === "partial_failed" ? "warning" : readyLike ? "success" : "neutral";

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card shadow-raised">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="grid min-h-[148px] grid-cols-[190px_minmax(0,1fr)]">
        <div className="relative grid place-items-center overflow-hidden border-r border-border bg-card-deep">
          <div
            className="relative grid size-[94px] place-items-center rounded-full border border-primary/35"
            style={{
              background:
                "repeating-radial-gradient(circle, transparent 0 17px, rgba(239,97,42,.12) 18px 19px), conic-gradient(from 210deg, rgba(239,97,42,.26), transparent 28%, transparent 100%)",
            }}
          >
            <span className="absolute inset-1/2 h-px w-[47px] origin-left animate-spin bg-gradient-to-r from-primary to-transparent [animation-duration:3.6s]" />
            <Radar size={25} className="relative z-10 text-primary" strokeWidth={1.4} />
            <span className="absolute left-[63%] top-[26%] size-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(239,97,42,.8)]" />
          </div>
          <span className="absolute bottom-3 font-mono text-[0.56rem] tracking-[0.15em] text-muted-foreground/35">
            SNAPSHOT ARRAY
          </span>
        </div>
        <div className="flex items-center justify-between gap-8 px-7 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Badge variant={tone}>{stateLabel[status.state]}</Badge>
              <span className="font-mono text-[0.68rem] tracking-[0.1em] text-muted-foreground/55">
                {status.data_source_name ?? "NO DATA SOURCE"}
              </span>
            </div>
            <h2 className="mt-3 font-display text-[1.35rem] tracking-tight">
              {readyLike ? "全市场指标底稿已装载" : status.message}
            </h2>
            {readyLike && (
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted-foreground">
                {status.message} · 业务时点 {formatDateTime(status.snapshot_time)}
              </p>
            )}
            {status.state === "not_configured" && (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/settings">前往系统设置</Link>
              </Button>
            )}
          </div>
          <div className="grid shrink-0 grid-cols-4 divide-x divide-border">
            <StatusMetric label="股票池" value={status.instrument_count || null} />
            <StatusMetric label="可筛标的" value={status.eligible_count || null} />
            <StatusMetric label="规则排除" value={status.excluded_count || null} />
            <StatusMetric
              label="总市值能力"
              value={status.total_market_cap_supported ? "READY" : "N/A"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusMetric({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="min-w-[102px] px-5 text-right">
      <p className="font-mono text-[0.58rem] tracking-[0.12em] text-muted-foreground/50">{label}</p>
      <p className="mt-2 font-mono text-xl tracking-tight text-foreground">
        {typeof value === "number" ? value.toLocaleString("zh-CN") : value ?? "—"}
      </p>
    </div>
  );
}

function RangeField({
  meta,
  value,
  disabled,
  unsupported,
  className,
  onChange,
}: {
  meta: (typeof FILTER_META)[number];
  value: { minimum: string; maximum: string };
  disabled: boolean;
  unsupported: boolean;
  className?: string;
  onChange: (side: "minimum" | "maximum", value: string) => void;
}) {
  return (
    <div className={cn("relative p-6", className)}>
      <span className="absolute right-5 top-5 font-mono text-[0.62rem] text-muted-foreground/35">
        {meta.ordinal}
      </span>
      <div className="flex items-center gap-2">
        <p className="text-[0.9rem] font-semibold text-foreground">{meta.label}</p>
        <span className="font-mono text-[0.62rem] text-primary/75">{meta.unit}</span>
      </div>
      <p className="mt-1 text-[0.72rem] text-muted-foreground/55">
        {unsupported ? "当前数据源暂不支持总市值" : meta.hint}
      </p>
      <div className="mt-4 grid grid-cols-[1fr_24px_1fr] items-center gap-2">
        <Input
          aria-label={`${meta.label}最小值`}
          type="number"
          inputMode="decimal"
          value={value.minimum}
          placeholder={meta.placeholder[0]}
          disabled={disabled}
          onChange={(event) => onChange("minimum", event.target.value)}
          className="h-9 font-mono text-[0.82rem]"
        />
        <span className="text-center font-mono text-muted-foreground/35">—</span>
        <Input
          aria-label={`${meta.label}最大值`}
          type="number"
          inputMode="decimal"
          value={value.maximum}
          placeholder={meta.placeholder[1]}
          disabled={disabled}
          onChange={(event) => onChange("maximum", event.target.value)}
          className="h-9 font-mono text-[0.82rem]"
        />
      </div>
    </div>
  );
}

function LogicStep({
  ordinal,
  title,
  description,
  color,
}: {
  ordinal: string;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="grid grid-cols-[34px_1fr] gap-3">
      <div className="relative grid size-8 place-items-center rounded-full border border-border bg-card-deep font-mono text-[0.72rem] text-foreground">
        {ordinal}
        <span className={cn("absolute -right-0.5 -top-0.5 size-2 rounded-full", color)} />
      </div>
      <div>
        <p className="text-[0.85rem] font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[0.75rem] leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ResultHeading({
  result,
  quotes,
}: {
  result: RadarSearchResult | null;
  quotes?: { market_status: string; polling_enabled: boolean };
}) {
  return (
    <div className="mb-3 flex items-end justify-between border-b border-border pb-3">
      <div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-primary" />
          <p className="eyebrow text-primary/80">SCREENING LEDGER</p>
        </div>
        <h2 className="mt-1.5 font-display text-[1.45rem] tracking-tight">筛选结果</h2>
      </div>
      <div className="flex items-center gap-5 text-[0.72rem] text-muted-foreground/65">
        {result && (
          <>
            <span>
              命中 <strong className="font-mono font-medium text-foreground">{result.total}</strong> 只
            </span>
            <span>
              数据不完整 <strong className="font-mono font-medium text-warning">{result.incomplete_total}</strong> 只
            </span>
            <span className="h-3 w-px bg-border" />
          </>
        )}
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 rounded-full",
              quotes?.polling_enabled ? "bg-success shadow-[0_0_7px_rgba(100,181,134,.65)]" : "bg-primary",
            )}
          />
          行情 · {quotes?.market_status ?? "等待筛选"}
        </span>
      </div>
    </div>
  );
}

function createColumns(
  result: RadarSearchResult | null,
  onSort: (field: RadarSortField) => void,
): ColumnDef<RadarResultItem, unknown>[] {
  const sortable = (label: string, field: RadarSortField) => () => (
      <SortHeader
        label={label}
        field={field}
        activeField={result?.sort_by}
        direction={result?.sort_direction}
        onSort={onSort}
      />
    );
  return [
    {
      id: "instrument",
      header: "标的",
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{row.original.name}</p>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.56rem] text-muted-foreground/55">
              {row.original.exchange}
            </span>
          </div>
          <p className="mt-1 font-mono text-[0.72rem] tracking-[0.05em] text-muted-foreground/55">
            {row.original.thscode}
          </p>
        </div>
      ),
      meta: { cellClassName: "sticky left-0 z-[1] min-w-[184px] bg-card group-hover:bg-secondary/60" },
    },
    {
      id: "latest",
      header: sortable("最新价", "latest"),
      cell: ({ row }) => formatPoint(row.original.latest),
      meta: { align: "right" },
    },
    {
      id: "change_percent",
      header: sortable("今日涨跌", "change_percent"),
      cell: ({ row }) => (
        <span className={movementClass(row.original.change_percent)}>
          {formatPercent(row.original.change_percent)}
        </span>
      ),
      meta: { align: "right" },
    },
    {
      id: "total_market_cap",
      header: sortable("总市值", "total_market_cap"),
      cell: ({ row }) =>
        row.original.total_market_cap === null
          ? "暂无数据"
          : `${row.original.total_market_cap.toFixed(2)} 亿`,
      meta: { align: "right" },
    },
    {
      id: "dividend_yield_ttm",
      header: sortable("股息率", "dividend_yield_ttm"),
      cell: ({ row }) => (
        <span className={cn(row.original.dividend_yield_ttm !== null && "font-semibold text-primary")}>
          {formatUnsignedPercent(row.original.dividend_yield_ttm)}
        </span>
      ),
      meta: { align: "right" },
    },
    {
      id: "pb_mrq",
      header: sortable("PB · MRQ", "pb_mrq"),
      cell: ({ row }) => formatPoint(row.original.pb_mrq),
      meta: { align: "right" },
    },
    {
      id: "roe_weighted",
      header: sortable("加权 ROE", "roe_weighted"),
      cell: ({ row }) => (
        <div className="text-right">
          <p>{formatUnsignedPercent(row.original.roe_weighted)}</p>
          <p className="mt-1 font-mono text-[0.6rem] text-muted-foreground/45">
            {row.original.roe_report_period ?? "报告期缺失"}
          </p>
        </div>
      ),
      meta: { align: "right" },
    },
    {
      id: "consecutive_dividend_years",
      header: sortable("连续分红", "consecutive_dividend_years"),
      cell: ({ row }) =>
        row.original.consecutive_dividend_years === null
          ? "暂无数据"
          : `${row.original.consecutive_dividend_years} 年`,
      meta: { align: "right" },
    },
    {
      id: "completeness",
      header: "数据完整性",
      cell: ({ row }) =>
        row.original.data_incomplete ? (
          <Badge variant="warning" title={row.original.missing_reasons.join("；")}>
            <CircleDashed size={11} className="mr-1" /> 数据不完整
          </Badge>
        ) : (
          <Badge variant="success">
            <CheckCircle2 size={11} className="mr-1" /> 筛选项完整
          </Badge>
        ),
      meta: { align: "center" },
    },
    {
      id: "metric_time",
      header: "指标快照",
      cell: ({ row }) => (
        <span className="text-[0.72rem] text-muted-foreground">
          {formatCompactTime(row.original.metric_time)}
        </span>
      ),
    },
  ];
}

function SortHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string;
  field: RadarSortField;
  activeField?: RadarSortField;
  direction?: SortDirection;
  onSort: (field: RadarSortField) => void;
}) {
  const active = activeField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center gap-1.5 transition hover:text-foreground",
        active && "text-primary",
      )}
    >
      {label}
      {!active ? (
        <ArrowUpDown size={11} />
      ) : direction === "asc" ? (
        <ArrowUp size={11} />
      ) : (
        <ArrowDown size={11} />
      )}
    </button>
  );
}

function ResultEmpty({ hasSearch, canSearch }: { hasSearch: boolean; canSearch: boolean }) {
  return (
    <div className="grid min-h-64 place-items-center px-6 py-14 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-secondary text-muted-foreground/60">
          {hasSearch ? <ScanSearch size={19} /> : canSearch ? <Sparkles size={19} /> : <DatabaseZap size={19} />}
        </span>
        <h3 className="mt-4 font-display text-[1.35rem] tracking-tight text-foreground">
          {hasSearch ? "当前条件没有命中标的" : canSearch ? "设置条件，启动第一次扫描" : "等待完整指标快照"}
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-[0.85rem] leading-6 text-muted-foreground">
          {hasSearch
            ? "放宽一个或多个区间后重新筛选；空区间代表不限制。"
            : canSearch
              ? "也可以保留全部条件为空，先查看当前可用的完整股票池。"
              : "红利雷达不会在点击筛选时逐只请求全市场数据，请先完成后台同步。"}
        </p>
      </div>
    </div>
  );
}

function Pagination({
  result,
  pending,
  onPage,
}: {
  result: RadarSearchResult;
  pending: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground/55">
        PAGE {String(result.page).padStart(2, "0")} / {String(Math.max(result.pages, 1)).padStart(2, "0")}
        <span className="mx-3 text-border">·</span>
        每页 {result.page_size} 条
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || result.page <= 1}
          onClick={() => onPage(result.page - 1)}
        >
          <ArrowLeft size={13} /> 上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || result.page >= result.pages}
          onClick={() => onPage(result.page + 1)}
        >
          下一页 <ArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
}

function parseFilters(draft: FilterDraft): RadarFilters | string {
  const result = {} as RadarFilters;
  for (const meta of FILTER_META) {
    const minimum = parseOptionalNumber(draft[meta.key].minimum);
    const maximum = parseOptionalNumber(draft[meta.key].maximum);
    if (minimum === "invalid" || maximum === "invalid") return `${meta.label}请输入有效数字`;
    if (minimum !== null && maximum !== null && minimum > maximum) {
      return `${meta.label}的最小值不能大于最大值`;
    }
    result[meta.key] = { minimum, maximum };
  }
  return result;
}

function parseOptionalNumber(value: string): number | null | "invalid" {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : "invalid";
}

function formatUnsignedPercent(value: number | null): string {
  return value === null ? "暂无数据" : `${value.toFixed(2)}%`;
}

function formatCompactTime(value: string | null): string {
  if (!value) return "暂无数据";
  const formatted = formatDateTime(value);
  return formatted === "暂无数据" ? formatted : formatted.slice(0, 16);
}
