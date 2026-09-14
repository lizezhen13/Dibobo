import { ArrowDown, ArrowUp, ArrowUpDown, FileText, PencilLine, Search, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, type DragEvent } from "react";

import { EmptyState, ErrorState, Pagination } from "../../components/patterns";
import { InstrumentCell } from "../../components/patterns/instrument-cell";
import { RecordCard } from "../../components/patterns/record-card";
import { Select } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from "../../components/ui/table";
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
  onMove,
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
  onMove: (id: string, direction: -1 | 1) => void;
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
    <TableFrame className="watchlist-table-card mt-6 flex-1">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-secondary/25 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-caption tracking-[0.14em] text-subtle">MY WATCHLIST</span>
          {selectedVisibleCount > 0 && <Badge variant="warning">已选 {selectedVisibleCount} 条</Badge>}
        </div>
        <div className="flex items-center gap-3 text-caption text-subtle">
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
          <div className="md:hidden" aria-label="自选记录">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <label className="flex min-h-11 items-center gap-2 text-label text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  ref={(element) => {
                    if (element) element.indeterminate = !allVisibleSelected && someVisibleSelected;
                  }}
                  className="size-5 accent-[var(--primary)]"
                />
                选择当前页
              </label>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Select aria-label="自选排序" value={sort.key} onChange={(event) => onSort(event.target.value as SortKey)}>
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
                {sort.key !== "custom" && (
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`切换为${sort.direction === "asc" ? "降序" : "升序"}`}
                    onClick={() => onSort(sort.key)}
                  >
                    {sort.direction === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                  </Button>
                )}
              </div>
            </div>
            {query.isLoading ? (
              <div className="p-6 text-body text-muted-foreground" role="status">
                正在加载自选…
              </div>
            ) : (
              pageItems.map((item) => (
                <RecordCard
                  key={item.id}
                  title={<InstrumentCell name={item.name} code={item.thscode} align="left" />}
                  selection={
                    <label className="grid size-11 shrink-0 place-items-center">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--primary)]"
                        checked={selectedIds.has(item.id)}
                        onChange={() => onToggleSelected(item.id)}
                        aria-label={`选择${item.name}`}
                      />
                    </label>
                  }
                  fields={[
                    { id: "latest", label: "最新价", value: <span className="numeric">{formatPoint(item.latest)}</span> },
                    {
                      id: "change_percent",
                      label: "涨跌幅",
                      value: (
                        <span className={cn("numeric", movementClass(item.change_percent))}>{formatPercent(item.change_percent)}</span>
                      ),
                    },
                  ]}
                  details={[
                    { id: "type", label: "类型", value: item.asset_type === "a_share" ? "A 股" : "ETF" },
                    {
                      id: "change",
                      label: "涨跌额",
                      value: <span className={movementClass(item.change)}>{formatSignedPoint(item.change)}</span>,
                    },
                    { id: "volume", label: "成交量", value: formatVolume(item.volume) },
                    { id: "turnover", label: "成交额", value: formatMoney(item.turnover) },
                    { id: "added_at", label: "添加时间", value: formatDateTime(item.added_at) },
                    { id: "note", label: "备注", value: item.note || "暂无备注" },
                  ]}
                  actions={
                    <>
                      {canDrag && (
                        <div className="mr-auto flex gap-1">
                          <Button
                            size="icon-sm"
                            variant="outline"
                            aria-label={`将${item.name}上移`}
                            disabled={displayItems[0]?.id === item.id}
                            onClick={() => onMove(item.id, -1)}
                          >
                            <ArrowUp size={16} />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="outline"
                            aria-label={`将${item.name}下移`}
                            disabled={displayItems[displayItems.length - 1]?.id === item.id}
                            onClick={() => onMove(item.id, 1)}
                          >
                            <ArrowDown size={16} />
                          </Button>
                        </div>
                      )}
                      <WatchlistActions
                        name={item.name}
                        onDetails={() => onDetails(item)}
                        onEditNote={() => onOpenNote(item)}
                        onDelete={() => onDelete(item)}
                      />
                    </>
                  }
                />
              ))
            )}
          </div>
          <div ref={tableScrollRef} className="watchlist-table-scroll workspace-table-scroll hidden flex-1 md:block">
            <Table
              className="watchlist-table w-full min-w-[1420px] whitespace-nowrap border-separate border-spacing-0 text-center text-table"
              aria-label="自选列表"
            >
              <TableHeader className="sticky top-0 z-20 border-b border-border bg-secondary">
                <TableRow>
                  <TableHead className="watchlist-sticky-left watchlist-sticky-select sticky left-0 top-0 z-30 w-12 bg-secondary px-4 py-3 text-center text-table">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={onToggleSelectAll}
                      aria-label="选择当前页"
                      className="size-4 accent-[var(--primary)]"
                    />
                  </TableHead>
                  <TableHead className="watchlist-sticky-left watchlist-sticky-instrument sticky left-12 top-0 z-30 min-w-[220px] bg-secondary ">
                    标的名称
                  </TableHead>
                  <TableHead className="min-w-[90px] ">类型</TableHead>
                  <SortableHeader label="最新价" sortKey="latest" sort={sort} onSort={onSort} />
                  <SortableHeader label="涨跌额" sortKey="change" sort={sort} onSort={onSort} />
                  <SortableHeader label="涨跌幅" sortKey="change_percent" sort={sort} onSort={onSort} />
                  <SortableHeader label="成交量" sortKey="volume" sort={sort} onSort={onSort} />
                  <SortableHeader label="成交额" sortKey="turnover" sort={sort} onSort={onSort} />
                  <SortableHeader label="添加时间" sortKey="added_at" sort={sort} onSort={onSort} />
                  <TableHead className="min-w-[180px] ">备注</TableHead>
                  <TableHead className="watchlist-sticky-right sticky right-0 top-0 z-30 w-36 bg-secondary text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {query.isLoading
                  ? Array.from({ length: 5 }, (_, index) => <LoadingRow key={index} />)
                  : pageItems.map((item, index) => {
                      return (
                        <WatchlistRow
                          key={item.id}
                          item={item}
                          index={index}
                          selected={selectedIds.has(item.id)}
                          canDrag={canDrag}
                          isDragging={draggedId === item.id}
                          onToggle={() => onToggleSelected(item.id)}
                          onDetails={() => onDetails(item)}
                          onEditNote={() => onOpenNote(item)}
                          onDelete={() => onDelete(item)}
                          onDragStart={() => onDragStart(item.id)}
                          onDragEnd={onDragEnd}
                          onDragOver={onDragOver}
                          onDrop={() => onDrop(item.id)}
                        />
                      );
                    })}
              </TableBody>
            </Table>
          </div>
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
    </TableFrame>
  );
}

function WatchlistRow({
  item,
  index,
  selected,
  canDrag,
  isDragging,
  onToggle,
  onDetails,
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
  onDetails: () => void;
  onEditNote: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLTableRowElement>) => void;
  onDrop: () => void;
}) {
  return (
    <TableRow
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
      <TableCell className="watchlist-sticky-left watchlist-sticky-select sticky left-0 z-10 w-12 bg-card px-4 py-3 text-center align-middle group-hover:bg-secondary">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`选择${item.name}`}
          className="size-4 accent-[var(--primary)]"
        />
      </TableCell>
      <TableCell className="watchlist-sticky-left watchlist-sticky-instrument sticky left-12 z-10 min-w-[220px] bg-card group-hover:bg-secondary">
        <InstrumentCell name={item.name} code={item.thscode} draggable={canDrag} />
      </TableCell>
      <TableCell className="text-center">
        <Badge className="text-table">{item.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>
      </TableCell>
      <TableCell className="font-mono tabular-nums text-table font-semibold text-foreground">{formatPoint(item.latest)}</TableCell>
      <TableCell className={cn("font-mono tabular-nums text-table", movementClass(item.change))}>
        {formatSignedPoint(item.change)}
      </TableCell>
      <TableCell className={cn("font-mono tabular-nums text-table", movementClass(item.change_percent))}>
        {formatPercent(item.change_percent)}
      </TableCell>
      <TableCell className="font-mono tabular-nums text-table text-foreground">{formatVolume(item.volume)}</TableCell>
      <TableCell className="font-mono tabular-nums text-table text-foreground">{formatMoney(item.turnover)}</TableCell>
      <TableCell className="font-mono text-table text-subtle">{formatDateTime(item.added_at)}</TableCell>
      <TableCell className="max-w-[220px] text-center">
        <button
          type="button"
          className="max-w-full truncate text-center text-table text-muted-foreground transition hover:text-primary-text"
          title={item.note ?? "添加备注"}
          onClick={onEditNote}
        >
          {item.note || <span className="text-subtle">添加备注</span>}
        </button>
      </TableCell>
      <TableCell className="watchlist-sticky-right sticky right-0 z-10 w-36 bg-card group-hover:bg-secondary">
        <WatchlistActions name={item.name} onDetails={onDetails} onEditNote={onEditNote} onDelete={onDelete} />
      </TableCell>
    </TableRow>
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
    <TableHead
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className="whitespace-nowrap text-center"
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
            <ArrowUp size={13} className="text-primary-text" />
          ) : (
            <ArrowDown size={13} className="text-primary-text" />
          )
        ) : (
          <ArrowUpDown size={13} className="text-subtle" />
        )}
      </button>
    </TableHead>
  );
}

function LoadingRow() {
  return (
    <TableRow>
      {Array.from({ length: 11 }, (_, index) => (
        <TableCell key={index} className="px-5 py-6">
          <div className="h-3 animate-pulse rounded-full bg-secondary" style={{ width: `${42 + (index % 4) * 12}%` }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

const SORT_LABELS: Record<SortKey, string> = {
  custom: "自定义顺序",
  latest: "最新价",
  change: "涨跌额",
  change_percent: "涨跌幅",
  volume: "成交量",
  turnover: "成交额",
  added_at: "添加时间",
};

function WatchlistActions({
  name,
  onDetails,
  onEditNote,
  onDelete,
}: {
  name: string;
  onDetails: () => void;
  onEditNote: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-center gap-1">
      <Button type="button" variant="ghost" size="icon-sm" onClick={onDetails} aria-label={`查看${name}详情`} title="查看详情">
        <FileText size={16} />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onEditNote} aria-label={`编辑${name}备注`} title="编辑备注">
        <PencilLine size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-danger hover:bg-danger/10 hover:text-danger"
        onClick={onDelete}
        aria-label={`删除${name}`}
        title="删除"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  );
}
