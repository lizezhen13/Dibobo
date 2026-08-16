import { ArrowDown, ArrowUp, ArrowUpDown, FileText, GripVertical, PencilLine, Search, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, type DragEvent } from "react";

import { EmptyState, ErrorState, Pagination } from "../../components/patterns";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatPoint,
  formatSignedPoint,
  formatVolume,
  movementClass,
} from "../../lib/formatters";
import { cn } from "../../lib/utils";
import type { WatchlistItem } from "./types";
import type { SortKey, SortState } from "./use-watchlist-controller";

interface WatchlistQueryState {
  data?: { polling_enabled: boolean; refresh_seconds: number };
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

export function WatchlistTable({
  query,
  sort,
  filterKey,
  selectedIds,
  draggedId,
  canDrag,
  pageItems,
  displayItems,
  isFiltered,
  selectedVisibleCount,
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  allVisibleSelected,
  someVisibleSelected,
  onToggleSelectAll,
  onToggleSelected,
  onOpenBatchDelete,
  onOpenNote,
  onDelete,
  onDetails,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveRow,
  onSort,
  onClear,
  onAdd,
  onPageChange,
}: {
  query: WatchlistQueryState;
  sort: SortState;
  filterKey: string;
  selectedIds: Set<string>;
  draggedId: string | null;
  canDrag: boolean;
  pageItems: WatchlistItem[];
  displayItems: WatchlistItem[];
  isFiltered: boolean;
  selectedVisibleCount: number;
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSelected: (id: string) => void;
  onOpenBatchDelete: () => void;
  onOpenNote: (item: WatchlistItem) => void;
  onDelete: (item: WatchlistItem) => void;
  onDetails: (item: WatchlistItem) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
  onDrop: (targetId: string) => void;
  onMoveRow: (id: string, direction: -1 | 1) => void;
  onSort: (key: SortKey) => void;
  onClear: () => void;
  onAdd: () => void;
  onPageChange: (page: number) => void;
}) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = !allVisibleSelected && someVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [filterKey, sort.direction, sort.key]);

  return (
    <div className="watchlist-table-card mt-8 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-raised">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-secondary/25 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-caption tracking-[0.14em] text-muted-foreground/60">MY WATCHLIST</span>
          {selectedVisibleCount > 0 && <Badge variant="warning">已选 {selectedVisibleCount} 条</Badge>}
        </div>
        <div className="flex items-center gap-3 text-caption text-muted-foreground/65">
          <span className={cn("size-1.5 rounded-full", query.data?.polling_enabled ? "bg-market-up" : "bg-primary")} />
          {query.data?.polling_enabled ? `自动刷新 · ${query.data.refresh_seconds}s` : "非交易时段 · 不轮询"}
          {selectedVisibleCount > 0 && (
            <Button variant="danger" size="sm" onClick={onOpenBatchDelete}>
              <Trash2 size={14} /> 批量删除
            </Button>
          )}
        </div>
      </div>

      {query.isError ? (
        <ErrorState
          title="自选列表加载失败"
          description="请检查网络或数据源连接，然后重试。"
          onRetry={() => void query.refetch()}
          className="min-h-64 border-0 bg-transparent shadow-none"
        />
      ) : (
        <>
          <div ref={tableScrollRef} className="watchlist-table-scroll min-h-0 flex-1 overflow-auto">
            <table
              className="watchlist-table w-full min-w-[1420px] whitespace-nowrap border-separate border-spacing-0 text-center text-table"
              aria-label="自选列表"
            >
              <thead className="sticky top-0 z-20 border-b border-border bg-secondary">
                <tr>
                  <th className="watchlist-sticky-left watchlist-sticky-select sticky left-0 top-0 z-30 w-12 bg-secondary px-4 py-3 text-center text-table">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={onToggleSelectAll}
                      aria-label="选择当前页"
                      className="size-4 accent-[var(--primary)]"
                    />
                  </th>
                  <th className="watchlist-sticky-left watchlist-sticky-instrument sticky left-12 top-0 z-30 min-w-[220px] bg-secondary px-5 py-3 text-table font-bold tracking-[0.1em] text-muted-foreground">
                    标的名称
                  </th>
                  <th className="min-w-[90px] px-5 py-3 text-table font-bold tracking-[0.1em] text-muted-foreground">类型</th>
                  <SortableHeader label="最新价" sortKey="latest" sort={sort} onSort={onSort} />
                  <SortableHeader label="涨跌额" sortKey="change" sort={sort} onSort={onSort} />
                  <SortableHeader label="涨跌幅" sortKey="change_percent" sort={sort} onSort={onSort} />
                  <SortableHeader label="成交量" sortKey="volume" sort={sort} onSort={onSort} />
                  <SortableHeader label="成交额" sortKey="turnover" sort={sort} onSort={onSort} />
                  <SortableHeader label="添加时间" sortKey="added_at" sort={sort} onSort={onSort} />
                  <th className="min-w-[180px] px-5 py-3 text-table font-bold tracking-[0.1em] text-muted-foreground">备注</th>
                  <th className="watchlist-sticky-right sticky right-0 top-0 z-30 w-36 bg-secondary px-5 py-3 text-center text-table font-bold tracking-[0.1em] text-muted-foreground">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {query.isLoading
                  ? Array.from({ length: 5 }, (_, index) => <LoadingRow key={index} />)
                  : pageItems.map((item, index) => {
                      const displayIndex = displayItems.findIndex((entry) => entry.id === item.id);
                      return (
                        <WatchlistRow
                          key={item.id}
                          item={item}
                          index={index}
                          selected={selectedIds.has(item.id)}
                          canDrag={canDrag}
                          isDragging={draggedId === item.id}
                          canMoveUp={canDrag && displayIndex > 0}
                          canMoveDown={canDrag && displayIndex < displayItems.length - 1}
                          onToggle={() => onToggleSelected(item.id)}
                          onDetails={() => onDetails(item)}
                          onEditNote={() => onOpenNote(item)}
                          onDelete={() => onDelete(item)}
                          onDragStart={() => onDragStart(item.id)}
                          onDragEnd={onDragEnd}
                          onDragOver={onDragOver}
                          onDrop={() => onDrop(item.id)}
                          onMove={(direction) => onMoveRow(item.id, direction)}
                        />
                      );
                    })}
              </tbody>
            </table>
            {!query.isLoading && displayItems.length === 0 && (
              <EmptyState
                icon={isFiltered ? Search : Star}
                title={isFiltered ? "没有符合条件的标的" : "先建立你的观察清单"}
                description={
                  isFiltered ? "换一个关键词或清除筛选，看看其他自选标的。" : "搜索一只 A 股或 ETF，把它放进你每天都会打开的列表。"
                }
                action={
                  <Button variant={isFiltered ? "outline" : "default"} onClick={isFiltered ? onClear : onAdd}>
                    {isFiltered ? (
                      <>
                        <X size={15} /> 清除筛选
                      </>
                    ) : (
                      "添加第一只自选"
                    )}
                  </Button>
                }
                className="min-h-64 rounded-none border-0 bg-transparent shadow-none"
              />
            )}
          </div>
          {!query.isLoading && displayItems.length > 0 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              pageStart={pageStart}
              pageEnd={pageEnd}
              totalItems={displayItems.length}
              onPageChange={onPageChange}
              isLoading={query.isFetching}
              compact
              alwaysVisible
            />
          )}
        </>
      )}
    </div>
  );
}

function WatchlistRow({
  item,
  index,
  selected,
  canDrag,
  isDragging,
  canMoveUp,
  canMoveDown,
  onToggle,
  onDetails,
  onEditNote,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
}: {
  item: WatchlistItem;
  index: number;
  selected: boolean;
  canDrag: boolean;
  isDragging: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onDetails: () => void;
  onEditNote: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
  onDrop: () => void;
  onMove: (direction: -1 | 1) => void;
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
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`选择${item.name}`}
          className="size-4 accent-[var(--primary)]"
        />
      </td>
      <td className="watchlist-sticky-left watchlist-sticky-instrument sticky left-12 z-10 min-w-[220px] bg-card px-5 py-3 text-center align-middle group-hover:bg-secondary">
        <div className="relative flex min-w-0 items-center justify-center">
          {canDrag && (
            <GripVertical className="absolute left-0 cursor-grab text-muted-foreground/45 active:cursor-grabbing" size={15} aria-hidden />
          )}
          <div className="min-w-0 text-center">
            <p className="truncate font-semibold text-foreground" title={item.name}>
              {item.name}
            </p>
            <p className="mt-1 font-mono text-label tracking-[0.04em] text-muted-foreground/60">{item.thscode}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3 text-center align-middle">
        <Badge className="text-table">{item.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
      </td>
      <td className="px-5 py-3 text-center align-middle font-mono tabular-nums text-table font-semibold text-foreground">
        {formatPoint(item.latest)}
      </td>
      <td className={cn("px-5 py-3 text-center align-middle font-mono tabular-nums text-table", movementClass(item.change))}>
        {formatSignedPoint(item.change)}
      </td>
      <td className={cn("px-5 py-3 text-center align-middle font-mono tabular-nums text-table", movementClass(item.change_percent))}>
        {formatPercent(item.change_percent)}
      </td>
      <td className="px-5 py-3 text-center align-middle font-mono tabular-nums text-table text-foreground/80">
        {formatVolume(item.volume)}
      </td>
      <td className="px-5 py-3 text-center align-middle font-mono tabular-nums text-table text-foreground/80">
        {formatMoney(item.turnover)}
      </td>
      <td className="px-5 py-3 text-center align-middle font-mono text-table text-muted-foreground/70">{formatDateTime(item.added_at)}</td>
      <td className="max-w-[220px] px-5 py-3 text-center align-middle">
        <button
          type="button"
          className="max-w-full truncate text-center text-table text-muted-foreground transition hover:text-primary"
          title={item.note ?? "添加备注"}
          onClick={onEditNote}
        >
          {item.note || <span className="text-muted-foreground/45">添加备注</span>}
        </button>
      </td>
      <td className="watchlist-sticky-right sticky right-0 z-10 w-36 bg-card px-5 py-3 text-center align-middle group-hover:bg-secondary">
        <div className="flex justify-center gap-1">
          {canDrag && (
            <>
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={!canMoveUp}
                aria-label={`将${item.name}上移`}
                title="上移"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-25"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={!canMoveDown}
                aria-label={`将${item.name}下移`}
                title="下移"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-25"
              >
                <ArrowDown size={14} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDetails}
            aria-label={`查看${item.name}详情`}
            title="查看详情"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
          >
            <FileText size={15} />
          </button>
          <button
            type="button"
            onClick={onEditNote}
            aria-label={`编辑${item.name}备注`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
          >
            <PencilLine size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`删除${item.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-danger/10 hover:text-danger"
          >
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
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className="whitespace-nowrap px-5 py-3 text-center text-table font-bold tracking-[0.1em] text-muted-foreground"
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 transition hover:text-foreground"
        onClick={() => onSort(sortKey)}
        aria-label={`按${label}${active && sort.direction === "desc" ? "降序" : "升序"}排序`}
      >
        {label}
        {active ? (
          sort.direction === "asc" ? (
            <ArrowUp size={13} className="text-primary" />
          ) : (
            <ArrowDown size={13} className="text-primary" />
          )
        ) : (
          <ArrowUpDown size={13} className="text-muted-foreground/45" />
        )}
      </button>
    </th>
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
