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
  Database,
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
  useRadarResultsQuery,
  useRadarSearchStatusQuery,
  useRadarStatusQuery,
  useStartRadarSearchMutation,
} from "./queries";
import type {
  RadarFilters,
  RadarResultItem,
  RadarSearchResult,
  RadarSearchStatus,
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
  const startSearch = useStartRadarSearchMutation();
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<RadarFilters | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<RadarSortField>("dividend_yield_ttm");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const searchStatusQuery = useRadarSearchStatusQuery(searchId);
  const searchStatus = searchStatusQuery.data;
  const searchReady = searchStatus?.state === "ready";
  const resultsQuery = useRadarResultsQuery(
    searchId,
    searchReady,
    page,
    sortBy,
    sortDirection,
  );
  const result = resultsQuery.data?.search_id === searchId ? resultsQuery.data : null;
  const quotes = useRadarQuotesQuery(
    searchId,
    searchReady,
    page,
    sortBy,
    sortDirection,
  );
  const searchRunning =
    startSearch.isPending || searchStatus?.state === "queued" || searchStatus?.state === "running";

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

  const runSearch = () => {
    const filters = parseFilters(draft);
    if (typeof filters === "string") {
      setValidationError(filters);
      return;
    }
    setValidationError(null);
    startSearch.mutate(
      {
        filters,
        page_size: 20,
        sort_by: sortBy,
        sort_direction: sortDirection,
      },
      {
        onSuccess: (queued) => {
          setActiveFilters(filters);
          setSearchId(queued.search_id);
          setPage(1);
        },
      },
    );
  };

  const changeSort = (field: RadarSortField) => {
    if (!result || !activeFilters || searchRunning) return;
    if (field === "total_market_cap" && !statusQuery.data?.total_market_cap_supported) return;
    const direction: SortDirection =
      sortBy === field && sortDirection === "desc" ? "asc" : "desc";
    startSearch.mutate(
      {
        filters: activeFilters,
        page_size: 20,
        sort_by: field,
        sort_direction: direction,
      },
      {
        onSuccess: (queued) => {
          setSortBy(field);
          setSortDirection(direction);
          setSearchId(queued.search_id);
          setPage(1);
        },
      },
    );
  };

  const columns = useMemo(
    () => createColumns(result, changeSort),
    // changeSort intentionally follows the latest result state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, sortBy, sortDirection],
  );

  const status = statusQuery.data;

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
            搜索时批量刷新行情与估值，只为候选股补齐 ROE 和分红；缺失指标不被误判为失败，而是留在结果末端供你复核。
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
            刷新缓存状态
          </Button>
        </div>
      </div>

      <RadarStatusPanel
        status={status}
        isLoading={statusQuery.isPending}
        isError={statusQuery.isError}
        onRetry={() => void statusQuery.refetch()}
      />

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
                  所有条件以 AND 连接 · 搜索时按需刷新过期指标
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
              {startSearch.isError && (
                <p className="flex items-center gap-2 text-[0.8rem] text-danger">
                  <AlertTriangle size={14} /> {startSearch.error.message}
                </p>
              )}
              {searchStatus?.state === "failed" && (
                <p className="flex items-center gap-2 text-[0.8rem] text-danger">
                  <AlertTriangle size={14} /> {searchStatus.error_summary ?? "实时检索失败"}
                </p>
              )}
              {!validationError && !startSearch.isError && searchStatus?.state !== "failed" && (
                <p className="flex items-center gap-2 text-[0.75rem] text-muted-foreground/60">
                  <Info size={13} /> 空条件优先复用缓存；缺失或过期指标才访问上游
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
                onClick={runSearch}
                disabled={!status?.can_search || searchRunning}
              >
                {searchRunning ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : (
                  <ScanSearch size={14} />
                )}
                {searchRunning ? "实时检索中" : searchId ? "重新检索" : "开始实时检索"}
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
              <span>指标获取</span>
              <span className="font-mono text-foreground/80">按需 + 缓存</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[0.75rem] text-muted-foreground">
              <span>行情刷新</span>
              <span className="font-mono text-foreground/80">交易中 5S</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[0.75rem] text-muted-foreground">
              <span>结果冻结</span>
              <span className="font-mono text-foreground/80">24H</span>
            </div>
          </div>
        </aside>
      </div>

      {searchStatus && <SearchProgressPanel status={searchStatus} />}

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
          isLoading={(searchRunning || resultsQuery.isFetching) && !result}
          getRowId={(item) => item.thscode}
          empty={<ResultEmpty hasSearch={Boolean(searchId)} canSearch={Boolean(status?.can_search)} />}
        />
        {result && result.total > 0 && (
          <Pagination
            result={result}
            pending={resultsQuery.isFetching}
            onPage={setPage}
          />
        )}
      </section>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4 font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground/50">
        <span>UNIVERSE · 沪 / 深 / 北 A 股 · 排除 ST、退市整理与无有效行情标的</span>
        <span>ON-DEMAND CACHE · 仅作条件筛选 · 不构成投资建议</span>
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
  const stateLabel: Record<RadarStatus["state"], string> = {
    not_configured: "未配置",
    ready: "检索就绪",
    unsupported: "暂不支持",
  };
  const tone = status.can_search ? "success" : "neutral";

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
            ON-DEMAND CACHE
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
              {status.can_search ? "按需指标检索引擎已就绪" : status.message}
            </h2>
            {status.can_search && (
              <p className="mt-1.5 text-[0.82rem] leading-relaxed text-muted-foreground">
                {status.message}
                {status.cache_updated_at
                  ? ` · 最近缓存写入 ${formatDateTime(status.cache_updated_at)}`
                  : " · 首次搜索将建立指标缓存"}
              </p>
            )}
            {status.state === "not_configured" && (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/settings">前往系统设置</Link>
              </Button>
            )}
          </div>
          <div className="grid shrink-0 grid-cols-4 divide-x divide-border">
            <StatusMetric label="缓存标的" value={status.cache_instrument_count || null} />
            <StatusMetric label="PB 缓存" value="5M" />
            <StatusMetric label="财务缓存" value="24H" />
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

function SearchProgressPanel({ status }: { status: RadarSearchStatus }) {
  const stageLabel: Record<RadarSearchStatus["stage"], string> = {
    queued: "等待执行",
    universe: "代码池",
    quotes: "实时行情",
    valuation: "PB 估值",
    fundamentals: "ROE / 分红",
    finalizing: "三值筛选",
    ready: "结果冻结",
    failed: "检索失败",
  };
  const baseProgress: Record<RadarSearchStatus["stage"], number> = {
    queued: 4,
    universe: 12,
    quotes: 28,
    valuation: 42,
    fundamentals: 48,
    finalizing: 94,
    ready: 100,
    failed: 100,
  };
  const candidateProgress =
    status.stage === "fundamentals" && status.candidate_count > 0
      ? (status.processed_count / status.candidate_count) * 44
      : 0;
  const progress = Math.min(100, baseProgress[status.stage] + candidateProgress);
  const tone =
    status.state === "failed" ? "danger" : status.state === "ready" ? "success" : "warning";

  return (
    <section className="relative mt-5 overflow-hidden rounded-xl border border-border bg-card shadow-raised">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="flex items-center justify-between gap-8 px-6 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full border",
              status.state === "failed"
                ? "border-danger/30 bg-danger/10 text-danger"
                : status.state === "ready"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            {status.state === "queued" || status.state === "running" ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : status.state === "ready" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Badge variant={tone}>{stageLabel[status.stage]}</Badge>
              <span className="font-mono text-[0.62rem] tracking-[0.12em] text-muted-foreground/45">
                SEARCH {status.search_id.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <p className="mt-1.5 truncate text-[0.82rem] text-muted-foreground">
              {status.error_summary ?? status.message ?? "正在准备实时检索"}
            </p>
          </div>
        </div>
        <div className="w-[360px] shrink-0">
          <div className="flex items-center justify-between font-mono text-[0.62rem] text-muted-foreground/55">
            <span>{status.processed_count.toLocaleString("zh-CN")} / {status.candidate_count.toLocaleString("zh-CN")}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                status.state === "failed" ? "bg-danger" : "bg-primary",
              )}
              style={{ width: `${progress}%` }}
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
            {result.stale_total > 0 && (
              <span>
                使用旧缓存 <strong className="font-mono font-medium text-primary">{result.stale_total}</strong> 只
              </span>
            )}
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
          <Badge
            variant="warning"
            title={[...row.original.missing_reasons, ...row.original.stale_fields.map((field) => `${field}使用旧缓存`)].join("；")}
          >
            <CircleDashed size={11} className="mr-1" /> 数据不完整
          </Badge>
        ) : row.original.data_stale ? (
          <Badge variant="warning" title={`${row.original.stale_fields.join("、")}使用旧缓存`}>
            <RefreshCw size={11} className="mr-1" /> 使用旧缓存
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
      header: "搜索冻结",
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
          {hasSearch ? <ScanSearch size={19} /> : canSearch ? <Sparkles size={19} /> : <Database size={19} />}
        </span>
        <h3 className="mt-4 font-display text-[1.35rem] tracking-tight text-foreground">
          {hasSearch ? "当前条件没有命中标的" : canSearch ? "设置条件，启动按需检索" : "等待数据源配置"}
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-[0.85rem] leading-6 text-muted-foreground">
          {hasSearch
            ? "放宽一个或多个区间后重新筛选；空区间代表不限制。"
            : canSearch
              ? "条件为空时优先复用缓存；缺失或过期的指标会在后台按需补齐。"
              : "请先在系统设置中测试并启用受支持的数据源。"}
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
