import {
  AlertTriangle,
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  GripVertical,
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatPoint,
  formatSignedPoint,
  formatVolume,
  movementClass,
} from "../../lib/formatters";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  useBatchDeleteWatchlistMutation,
  useDeleteWatchlistMutation,
  useReorderWatchlistMutation,
  useWatchlistQuery,
} from "./queries";
import { WatchlistAddDialog } from "./watchlist-add-dialog";
import { WatchlistNoteDialog } from "./watchlist-note-dialog";
import type { WatchlistAssetType, WatchlistFilters, WatchlistItem } from "./types";

const DEFAULT_FILTERS: WatchlistFilters = { keyword: "", asset_type: "" };

type SortKey =
  | "custom"
  | "latest"
  | "change"
  | "change_percent"
  | "volume"
  | "turnover"
  | "added_at";
type SortDirection = "asc" | "desc";
interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const DEFAULT_SORT: SortState = { key: "custom", direction: "asc" };

export function WatchlistPage() {
  const [filters, setFilters] = useState<WatchlistFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [noteDialogItem, setNoteDialogItem] = useState<WatchlistItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WatchlistItem | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const query = useWatchlistQuery(filters);
  const deleteMutation = useDeleteWatchlistMutation();
  const batchDeleteMutation = useBatchDeleteWatchlistMutation();
  const reorderMutation = useReorderWatchlistMutation();
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const items = query.data?.items ?? [];
  const activeFilterCount = (filters.keyword.trim() ? 1 : 0) + (filters.asset_type ? 1 : 0);
  const isFiltered = Boolean(filters.keyword.trim() || filters.asset_type);
  const canDrag = !isFiltered && sort.key === "custom" && !reorderMutation.isPending;

  const displayItems = useMemo(() => {
    if (sort.key === "custom") return items;
    return [...items].sort((left, right) => {
      const comparison = compareValues(sortValue(left, sort.key), sortValue(right, sort.key));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [items, sort]);

  const allVisibleSelected = displayItems.length > 0 && displayItems.every((item) => selectedIds.has(item.id));
  const someVisibleSelected = displayItems.some((item) => selectedIds.has(item.id));
  const selectedVisibleCount = displayItems.filter((item) => selectedIds.has(item.id)).length;
  const latestQuoteTime = useMemo(() => {
    const timestamps = items
      .map((item) => item.quoted_at)
      .filter((value): value is string => Boolean(value));
    if (timestamps.length === 0) return null;
    return timestamps.reduce((latest, current) => (
      new Date(current).getTime() > new Date(latest).getTime() ? current : latest
    ));
  }, [items]);

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = !allVisibleSelected && someVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters.asset_type, filters.keyword]);

  function updateFilter<K extends keyof WatchlistFilters>(key: K, value: WatchlistFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        displayItems.forEach((item) => next.delete(item.id));
      } else {
        displayItems.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }

  function requestSort(key: SortKey) {
    setSort((current) => {
      if (current.key !== key) return { key, direction: "desc" };
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setSort(DEFAULT_SORT);
  }

  async function dropRow(targetId: string) {
    if (!draggedId || draggedId === targetId || !canDrag) return;
    const next = [...items];
    const fromIndex = next.findIndex((item) => item.id === draggedId);
    const targetIndex = next.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    const nextTargetIndex = next.findIndex((item) => item.id === targetId);
    next.splice(nextTargetIndex < 0 ? next.length : nextTargetIndex, 0, moved);
    try {
      await reorderMutation.mutateAsync(next.map((item) => item.id));
    } catch {
      // The mutation error is shown above the table.
    } finally {
      setDraggedId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    }
  }

  async function confirmBatchDelete() {
    const ids = displayItems.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
    if (ids.length === 0) return;
    try {
      await batchDeleteMutation.mutateAsync(ids);
      setSelectedIds(new Set());
      setBatchDeleteOpen(false);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    }
  }

  const source = query.data?.data_source;
  const marketStatus = query.data?.market_status ?? "未知";
  const mutationError = deleteMutation.error ?? batchDeleteMutation.error ?? reorderMutation.error;
  const mutationErrorMessage = mutationError instanceof ApiError ? mutationError.message : mutationError ? "操作失败，请稍后重试" : null;

  return (
    <div className="mx-auto max-w-[1700px] animate-enter">
      <div className="mb-8 flex items-end justify-between gap-8">
        <div>
          <p className="eyebrow text-primary/90">WATCHLIST / 自选管理</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">自选管理</h1>
          <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            只保留你真正想盯住的 A 股与 ETF；顺序、备注和观察习惯都属于你。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn(query.isFetching && "animate-spin")} size={15} /> 刷新行情
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus size={17} /> 添加自选
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]">
        <div className="relative min-h-[142px] overflow-hidden rounded-xl border border-primary/20 bg-card shadow-raised">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary/55 to-primary/10" />
          <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full border border-primary/10 bg-primary/8 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/4 h-px w-3/4 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="relative flex min-h-[142px] flex-col justify-between px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <Activity size={16} />
                </span>
                <div>
                  <p className="font-mono text-[11.5px] tracking-[0.16em] text-muted-foreground/65">WATCHLIST DESK / ACTIVE</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground/55">自选观察面板</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 font-mono text-[0.62rem] tracking-[0.08em] text-primary/85">
                <span className={cn("size-1.5 rounded-full", query.data?.polling_enabled ? "animate-pulse bg-market-up" : "bg-primary/70")} />
                {query.data?.polling_enabled ? "LIVE" : "STANDBY"}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="flex items-baseline gap-3">
                <p className="whitespace-nowrap text-[14px] text-muted-foreground">当前自选标的</p>
                <p className="font-display text-4xl leading-none tracking-tight text-foreground">{query.data ? items.length : "—"}</p>
                <span className="text-[14px] text-muted-foreground/65">只</span>
              </div>

              <div className="border-l border-border/70 pl-4 text-right">
                <p className="flex items-center justify-end gap-1.5 font-mono text-[0.61rem] tracking-[0.13em] text-muted-foreground/60">
                  <Clock3 size={12} /> MARKET STATUS
                </p>
                <div className="mt-1 flex items-center justify-end gap-2 text-[0.84rem] font-semibold text-foreground">
                  <span className={cn("size-1.5 rounded-full", marketStatus === "交易中" ? "bg-market-up" : "bg-primary")} />
                  {marketStatus}
                </div>
                <p className="mt-0.5 text-[0.68rem] text-muted-foreground/55">
                  {latestQuoteTime ? `最新行情 ${formatDateTime(latestQuoteTime)}` : "等待行情数据"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-[128px] flex-col justify-center overflow-hidden rounded-xl border border-border bg-card px-5 py-3 shadow-raised">
          <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full border border-primary/10 bg-primary/8 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/4 h-px w-3/4 bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
          <div className="relative">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <SlidersHorizontal size={15} />
                </span>
                <div>
                  <p className="font-mono text-[0.63rem] tracking-[0.16em] text-muted-foreground/65">FILTER DECK / WATCHLIST</p>
                  <p className="mt-0.5 text-[0.75rem] text-muted-foreground/55">快速定位并缩小观察范围</p>
                </div>
              </div>
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.62rem] tracking-[0.08em] transition-colors",
                activeFilterCount > 0
                  ? "border-primary/25 bg-primary/10 text-primary/90"
                  : "border-border/80 bg-background/35 text-muted-foreground/65",
              )}>
                <span className={cn("size-1.5 rounded-full", activeFilterCount > 0 ? "bg-primary" : "bg-muted-foreground/45")} />
                {activeFilterCount > 0 ? `${activeFilterCount} 项条件已启用` : "全部标的"}
              </span>
            </div>

            <div className="watchlist-filter-primary">
              <div className="min-w-0">
                  <p className="mb-1.5 text-[0.72rem] font-medium text-muted-foreground">搜索标的</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/65" size={16} />
                    <Input
                      value={filters.keyword}
                      onChange={(event) => updateFilter("keyword", event.target.value)}
                      placeholder="筛选代码或名称"
                      className={cn("pl-10 pr-10", filters.keyword && "border-primary/40 bg-primary/[0.04]")}
                    />
                    {filters.keyword && (
                      <button
                        type="button"
                        aria-label="清除关键词"
                        className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        onClick={() => updateFilter("keyword", "")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
              </div>
              <div className="min-w-0">
                <p className="mb-1.5 text-[0.72rem] font-medium text-muted-foreground">标的类型</p>
                <WatchlistTypeFilter
                  value={filters.asset_type}
                  onChange={(asset_type) => updateFilter("asset_type", asset_type)}
                />
              </div>
            </div>
          </div>
          {(isFiltered || sort.key !== "custom") && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[0.72rem] text-muted-foreground/65">
              <div className="flex flex-wrap items-center gap-3">
                {isFiltered && <span>筛选后显示 {displayItems.length} 条</span>}
                {sort.key !== "custom" && <span className="font-mono tracking-[0.05em]">TEMP SORT · {sortLabel(sort.key)}</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X size={14} /> 恢复默认
              </Button>
            </div>
          )}
        </div>
      </section>

      {source && source.state !== "ready" && (
        <div className="mt-4 flex items-center justify-between gap-6 rounded-xl border border-border bg-card px-6 py-5 shadow-subtle">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary/90">
              <Settings size={16} />
            </span>
            <div>
              <p className="text-[0.95rem] font-semibold text-foreground">行情连接未就绪</p>
              <p className="mt-1 text-[0.85rem] leading-relaxed text-muted-foreground">{source.message ?? "请检查当前启用的数据源"}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">前往系统设置</Link>
          </Button>
        </div>
      )}

      {(query.data?.stale || mutationErrorMessage) && (
        <div className={cn(
          "mt-4 flex items-center gap-2.5 rounded-r-xl border-l-4 px-5 py-3.5 text-[0.85rem]",
          mutationErrorMessage ? "border-market-up bg-market-up/7 text-danger" : "border-warning bg-warning/8 text-warning",
        )}>
          {mutationErrorMessage ? <AlertTriangle size={16} /> : <AlertTriangle size={16} />}
          <span>{mutationErrorMessage ?? "当前展示的是最后一次成功行情，数据源正在重试。"}</span>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card shadow-raised">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-secondary/25 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.66rem] tracking-[0.14em] text-muted-foreground/60">MY WATCHLIST</span>
            {selectedVisibleCount > 0 && (
              <Badge variant="warning">已选 {selectedVisibleCount} 条</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-[0.72rem] text-muted-foreground/65">
            <span className={cn("size-1.5 rounded-full", query.data?.polling_enabled ? "bg-market-up" : "bg-primary")} />
            {query.data?.polling_enabled ? `自动刷新 · ${query.data.refresh_seconds}s` : "非交易时段 · 不轮询"}
            {selectedVisibleCount > 0 && (
              <Button variant="danger" size="sm" onClick={() => setBatchDeleteOpen(true)}>
                <Trash2 size={14} /> 批量删除
              </Button>
            )}
          </div>
        </div>

        {query.isError ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : (
          <div className="watchlist-table-scroll max-h-[calc(100vh-340px)] overflow-auto">
            <table className="watchlist-table w-full min-w-[1420px] whitespace-nowrap border-separate border-spacing-0 text-center text-[13px]">
              <thead className="sticky top-0 z-20 border-b border-border bg-secondary/55">
                <tr>
                  <th className="watchlist-sticky-left watchlist-sticky-select sticky left-0 top-0 z-30 w-12 bg-secondary px-4 py-3 text-center">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="选择当前筛选结果"
                      className="size-4 accent-[var(--primary)]"
                    />
                  </th>
                  <th className="watchlist-sticky-left watchlist-sticky-instrument sticky left-12 top-0 z-30 min-w-[220px] bg-secondary px-5 py-3 text-[13px] font-bold tracking-[0.1em] text-muted-foreground">标的名称</th>
                  <th className="min-w-[90px] px-5 py-3 text-[13px] font-bold tracking-[0.1em] text-muted-foreground">类型</th>
                  <SortableHeader label="最新价" sortKey="latest" sort={sort} onSort={requestSort} />
                  <SortableHeader label="涨跌额" sortKey="change" sort={sort} onSort={requestSort} />
                  <SortableHeader label="涨跌幅" sortKey="change_percent" sort={sort} onSort={requestSort} />
                  <SortableHeader label="成交量" sortKey="volume" sort={sort} onSort={requestSort} />
                  <SortableHeader label="成交额" sortKey="turnover" sort={sort} onSort={requestSort} />
                  <SortableHeader label="添加时间" sortKey="added_at" sort={sort} onSort={requestSort} />
                  <th className="min-w-[180px] px-5 py-3 text-[13px] font-bold tracking-[0.1em] text-muted-foreground">备注</th>
                  <th className="watchlist-sticky-right sticky right-0 top-0 z-30 w-36 bg-secondary px-5 py-3 text-center text-[13px] font-bold tracking-[0.1em] text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {query.isLoading
                  ? Array.from({ length: 5 }, (_, index) => <LoadingRow key={index} />)
                  : displayItems.map((item, index) => (
                    <WatchlistRow
                      key={item.id}
                      item={item}
                      index={index}
                      selected={selectedIds.has(item.id)}
                      canDrag={canDrag}
                      isDragging={draggedId === item.id}
                      onToggle={() => toggleSelected(item.id)}
                      onEditNote={() => setNoteDialogItem(item)}
                      onDelete={() => setDeleteTarget(item)}
                      onDragStart={() => setDraggedId(item.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onDragOver={(event) => {
                        if (canDrag) event.preventDefault();
                      }}
                      onDrop={() => void dropRow(item.id)}
                    />
                  ))}
              </tbody>
            </table>
            {!query.isLoading && displayItems.length === 0 && (
              <EmptyState filtered={isFiltered} onAdd={() => setAddDialogOpen(true)} onClear={clearFilters} />
            )}
          </div>
        )}
      </div>

      <WatchlistAddDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
      <WatchlistNoteDialog
        open={noteDialogItem !== null}
        onOpenChange={(open) => !open && setNoteDialogItem(null)}
        item={noteDialogItem}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>从自选列表移除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              这只标的会从你的自选列表中永久删除，投资组合和其他数据不会受到影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && <MutationError error={deleteMutation.error} />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteMutation.isPending && <LoaderCircle className="animate-spin" size={14} />}
              确认移除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除选中的 {selectedVisibleCount} 条自选？</AlertDialogTitle>
            <AlertDialogDescription>
              这些记录会被永久删除，操作不可撤销。未选中的标的不会受到影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {batchDeleteMutation.error && <MutationError error={batchDeleteMutation.error} />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchDeleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmBatchDelete();
              }}
            >
              {batchDeleteMutation.isPending && <LoaderCircle className="animate-spin" size={14} />}
              确认批量删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WatchlistTypeFilter({
  value,
  onChange,
}: {
  value: WatchlistAssetType | "";
  onChange: (value: WatchlistAssetType | "") => void;
}) {
  const [open, setOpen] = useState(false);
  const options: Array<{ value: WatchlistAssetType | ""; label: string }> = [
    { value: "", label: "全部类型" },
    { value: "a_share", label: "A 股" },
    { value: "fund_etf", label: "ETF" },
  ];
  const selected = options.find((option) => option.value === value) ?? options[0]!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="标的类型"
          aria-expanded={open}
          className={cn(
            "inline-flex h-10 w-full min-w-[126px] items-center justify-between gap-2 rounded-lg border bg-background px-3.5 text-[0.86rem] text-foreground transition hover:border-primary/40 hover:bg-secondary focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15",
            value ? "border-primary/40 bg-primary/[0.06]" : "border-input",
          )}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-muted-foreground" />
            {selected.label}
          </span>
          <ChevronDown size={15} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[164px] p-1.5">
        <div role="listbox" aria-label="标的类型" className="space-y-0.5">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "all"}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.84rem] transition",
                  isSelected
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="grid w-4 place-items-center">
                  {isSelected && <Check size={14} />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WatchlistRow({
  item,
  index,
  selected,
  canDrag,
  isDragging,
  onToggle,
  onEditNote,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: WatchlistItem;
  index: number;
  selected: boolean;
  canDrag: boolean;
  isDragging: boolean;
  onToggle: () => void;
  onEditNote: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
  onDrop: () => void;
}) {
  return (
    <tr
      draggable={canDrag}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "group transition-colors duration-150 hover:bg-row-hover",
        index % 2 === 1 && "bg-row-stripe",
        selected && "watchlist-row--selected bg-primary/[0.055]",
        isDragging && "opacity-45",
      )}
    >
      <td className="watchlist-sticky-left watchlist-sticky-select sticky left-0 z-10 w-12 bg-card px-4 py-3 text-center align-middle group-hover:bg-secondary">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`选择${item.name}`} className="size-4 accent-[var(--primary)]" />
      </td>
      <td className="watchlist-sticky-left watchlist-sticky-instrument sticky left-12 z-10 min-w-[220px] bg-card px-5 py-3 text-center align-middle group-hover:bg-secondary">
        <div className="relative flex min-w-0 items-center justify-center">
          {canDrag && <GripVertical className="absolute left-0 cursor-grab text-muted-foreground/45 active:cursor-grabbing" size={15} aria-hidden />}
          <div className="min-w-0 text-center">
            <p className="truncate font-semibold text-foreground" title={item.name}>{item.name}</p>
            <p className="mt-1 font-mono text-[0.72rem] tracking-[0.04em] text-muted-foreground/60">{item.thscode}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3 text-center align-middle"><Badge className="text-[13px]">{item.asset_type === "a_share" ? "A 股" : "ETF"}</Badge></td>
      <td className="px-5 py-3 text-center align-middle font-mono tabular-nums text-[13px] font-semibold text-foreground">{formatPoint(item.latest)}</td>
      <td className={cn("px-5 py-3 text-center align-middle font-mono tabular-nums text-[13px]", movementClass(item.change))}>{formatSignedPoint(item.change)}</td>
      <td className={cn("px-5 py-3 text-center align-middle font-mono tabular-nums text-[13px]", movementClass(item.change_percent))}>{formatPercent(item.change_percent)}</td>
      <td className="px-5 py-3 text-center align-middle font-mono tabular-nums text-[13px] text-foreground/80">{formatVolume(item.volume)}</td>
      <td className="px-5 py-3 text-center align-middle font-mono tabular-nums text-[13px] text-foreground/80">{formatMoney(item.turnover)}</td>
      <td className="px-5 py-3 text-center align-middle font-mono text-[13px] text-muted-foreground/70">{formatDateTime(item.added_at)}</td>
      <td className="max-w-[220px] px-5 py-3 text-center align-middle">
        <button type="button" className="max-w-full truncate text-center text-[13px] text-muted-foreground transition hover:text-primary" title={item.note ?? "添加备注"} onClick={onEditNote}>
          {item.note || <span className="text-muted-foreground/45">添加备注</span>}
        </button>
      </td>
      <td className="watchlist-sticky-right sticky right-0 z-10 w-36 bg-card px-5 py-3 text-center align-middle group-hover:bg-secondary">
        <div className="flex justify-center gap-1">
          <button
            type="button"
            disabled
            aria-label={`查看${item.name}详情`}
            title="详情功能待定"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground/55 transition disabled:cursor-not-allowed"
          >
            <FileText size={15} />
          </button>
          <button type="button" onClick={onEditNote} aria-label={`编辑${item.name}备注`} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
            <PencilLine size={15} />
          </button>
          <button type="button" onClick={onDelete} aria-label={`删除${item.name}`} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-danger/10 hover:text-danger">
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <th className={cn("whitespace-nowrap px-5 py-3 text-center text-[13px] font-bold tracking-[0.1em] text-muted-foreground", align === "right" && "text-right", className)}>
      <SortButton label={label} sortKey={sortKey} sort={sort} onSort={onSort} align={align} />
    </th>
  );
}

function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <button type="button" className={cn("inline-flex items-center gap-1 transition hover:text-foreground", align === "right" && "justify-end")} onClick={() => onSort(sortKey)}>
      {label}
      {active ? (sort.direction === "asc" ? <ArrowUp size={13} className="text-primary" /> : <ArrowDown size={13} className="text-primary" />) : <ArrowUpDown size={13} className="text-muted-foreground/45" />}
    </button>
  );
}

function LoadingRow() {
  return (
    <tr>
      {Array.from({ length: 11 }, (_, index) => (
        <td key={index} className="px-5 py-6">
          <div className="h-3 animate-pulse rounded-full bg-secondary" style={{ width: `${42 + (index % 4) * 12}%` }} />
        </td>
      ))}
    </tr>
  );
}

function EmptyState({
  filtered,
  onAdd,
  onClear,
}: {
  filtered: boolean;
  onAdd: () => void;
  onClear: () => void;
}) {
  return (
    <div className="border-t border-border/60 px-6 py-16 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/8 text-primary">
        {filtered ? <Search size={23} /> : <Star size={23} />}
      </span>
      <p className="mt-5 font-mono text-[0.64rem] tracking-[0.16em] text-primary/75">WATCHLIST / {filtered ? "NO MATCH" : "EMPTY"}</p>
      <h2 className="mt-2 font-display text-2xl tracking-tight text-foreground">{filtered ? "没有符合条件的标的" : "先建立你的观察清单"}</h2>
      <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-relaxed text-muted-foreground">
        {filtered ? "换一个关键词或清除筛选，看看其他自选标的。" : "搜索一只 A 股或 ETF，把它放进你每天都会打开的列表。"}
      </p>
      <Button className="mt-6" variant={filtered ? "outline" : "default"} onClick={filtered ? onClear : onAdd}>
        {filtered ? <><X size={15} /> 清除筛选</> : <><Plus size={16} /> 添加第一只自选</>}
      </Button>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle size={23} />
      </span>
      <h2 className="mt-5 font-display text-2xl tracking-tight text-foreground">自选列表加载失败</h2>
      <p className="mt-2 text-[0.9rem] text-muted-foreground">请检查网络或数据源连接，然后重试。</p>
      <Button variant="outline" className="mt-6" onClick={onRetry}><RefreshCw size={15} /> 重试</Button>
    </div>
  );
}

function MutationError({ error }: { error: Error | null }) {
  return (
    <div role="alert" className="mt-4 border-l-2 border-market-up bg-danger/10 px-4 py-3 text-sm text-danger">
      {error instanceof ApiError ? error.message : "操作失败，请稍后重试"}
    </div>
  );
}

function sortValue(item: WatchlistItem, key: SortKey): number | string | null {
  switch (key) {
    case "latest": return item.latest;
    case "change": return item.change;
    case "change_percent": return item.change_percent;
    case "volume": return item.volume;
    case "turnover": return item.turnover;
    case "added_at": return item.added_at;
    case "custom": return item.sort_order;
  }
}

function compareValues(left: number | string | null, right: number | string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "zh-CN");
}

function sortLabel(key: SortKey): string {
  const labels: Record<SortKey, string> = {
    custom: "自定义顺序",
    latest: "最新价",
    change: "涨跌额",
    change_percent: "涨跌幅",
    volume: "成交量",
    turnover: "成交额",
    added_at: "添加时间",
  };
  return labels[key];
}
