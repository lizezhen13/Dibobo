import type { ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  ArrowUpDown,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileText,
  GripVertical,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

import { DataTable } from "../../components/data-table";
import { EmptyState, ErrorState, Pagination } from "../../components/patterns";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { formatDateTime, formatMoney, formatPercent, formatPoint, movementClass } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { DateRangeField } from "../holdings/date-range-field";
import type { AssetType, Holding, HoldingStatus, HoldingsFilters, HoldingsList, Portfolio } from "../holdings/types";
import type { HoldingSortKey, HoldingSortState } from "./use-portfolios-controller";

interface HoldingsQueryState {
  data?: HoldingsList;
  isError: boolean;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

export function PortfolioHoldingsWorkspace({
  selectedPortfolio,
  activeTab,
  setActiveTab,
  filters,
  setFilters,
  resetHoldingList,
  openHoldings,
  closedHoldings,
  openItems,
  closedItems,
  activeHoldings,
  canReorderOpen,
  pagedOpenHoldings,
  pagedClosedHoldings,
  totalHoldingPages,
  currentHoldingPage,
  holdingPageStart,
  holdingPageEnd,
  holdingSort,
  toggleHoldingSort,
  goToHoldingPage,
  openHoldingEditor,
  onDetails,
  setDeleteHoldingTarget,
  reorderOpenHoldings,
}: {
  selectedPortfolio: Portfolio;
  activeTab: HoldingStatus;
  setActiveTab: (status: HoldingStatus) => void;
  filters: HoldingsFilters;
  setFilters: (filters: HoldingsFilters) => void;
  resetHoldingList: () => void;
  openHoldings: HoldingsQueryState;
  closedHoldings: HoldingsQueryState;
  openItems: Holding[];
  closedItems: Holding[];
  activeHoldings: Holding[];
  canReorderOpen: boolean;
  pagedOpenHoldings: Holding[];
  pagedClosedHoldings: Holding[];
  totalHoldingPages: number;
  currentHoldingPage: number;
  holdingPageStart: number;
  holdingPageEnd: number;
  holdingSort: HoldingSortState;
  toggleHoldingSort: (key: HoldingSortKey) => void;
  goToHoldingPage: (page: number) => void;
  openHoldingEditor: (holding: Holding | null) => void;
  onDetails: (holding: Holding) => void;
  setDeleteHoldingTarget: (holding: Holding | null) => void;
  reorderOpenHoldings: (activeId: string, overId: string) => void | Promise<void>;
}) {
  const openColumns = createOpenColumns(
    openHoldingEditor,
    onDetails,
    setDeleteHoldingTarget,
    holdingSort,
    toggleHoldingSort,
    canReorderOpen,
  );
  const closedColumns = createClosedColumns(openHoldingEditor, onDetails, setDeleteHoldingTarget, holdingSort, toggleHoldingSort);

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-raised">
      <div className="flex shrink-0 flex-col gap-2 bg-transparent px-5 pt-0 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as HoldingStatus)}>
          <TabsList variant="underline" className="border-b-0">
            <TabsTrigger value="open" className="text-sm">
              当前持仓
              <span className="font-mono text-caption-xs text-muted-foreground/60">
                {openHoldings.data?.items.length ?? selectedPortfolio.open_holding_count}
              </span>
            </TabsTrigger>
            <TabsTrigger value="closed" className="text-sm">
              已清仓
              <span className="font-mono text-caption-xs text-muted-foreground/60">{closedHoldings.data?.items.length ?? 0}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mb-3 flex items-center gap-3 text-caption tracking-[0.05em] text-muted-foreground/60">
          <span className={cn("size-1.5 rounded-full", openHoldings.data?.market_status === "交易中" ? "bg-market-down" : "bg-primary")} />
          {activeTab === "open" ? `市场 · ${openHoldings.data?.market_status ?? "未知"}` : "历史记录 · 不轮询行情"}
          {openHoldings.data?.stale && <Badge variant="warning">最后成功行情</Badge>}
        </div>
      </div>

      <HoldingsFilterBar filters={filters} onChange={setFilters} onReset={resetHoldingList} onAdd={() => openHoldingEditor(null)} />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as HoldingStatus)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsContent value="open" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          {openHoldings.isError ? (
            <ErrorState
              title="当前持仓加载失败"
              onRetry={() => void openHoldings.refetch()}
              className="min-h-64 rounded-none border-0 bg-transparent shadow-none"
            />
          ) : (
            <DataTable
              key={`open-${currentHoldingPage}-${openItems.length}`}
              columns={openColumns}
              data={pagedOpenHoldings}
              isLoading={openHoldings.isLoading}
              getRowId={(holding) => holding.id}
              stickyHeader
              centered
              ariaLabel="当前持仓"
              rowReorder={{ enabled: canReorderOpen, onReorder: reorderOpenHoldings }}
              className="rounded-none border-0 bg-transparent shadow-none"
              empty={
                <EmptyState
                  icon={BriefcaseBusiness}
                  title="组合里还没有当前持仓"
                  description="从数据源检索 A 股或 ETF，把第一只股票放进这个组合。"
                  action={
                    <Button size="sm" onClick={() => openHoldingEditor(null)}>
                      添加第一只股票
                    </Button>
                  }
                  className="min-h-64 rounded-none border-x-0 border-b-0 bg-transparent shadow-none"
                />
              }
              pagination={
                activeTab === "open" && !openHoldings.isLoading && openItems.length > 0 ? (
                  <Pagination
                    page={currentHoldingPage}
                    totalPages={totalHoldingPages}
                    pageStart={holdingPageStart}
                    pageEnd={holdingPageEnd}
                    totalItems={activeHoldings.length}
                    onPageChange={goToHoldingPage}
                    compact
                    alwaysVisible
                    className="shrink-0"
                  />
                ) : undefined
              }
            />
          )}
        </TabsContent>
        <TabsContent value="closed" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          {closedHoldings.isError ? (
            <ErrorState
              title="清仓历史加载失败"
              onRetry={() => void closedHoldings.refetch()}
              className="min-h-64 rounded-none border-0 bg-transparent shadow-none"
            />
          ) : (
            <DataTable
              key={`closed-${currentHoldingPage}-${closedItems.length}`}
              columns={closedColumns}
              data={pagedClosedHoldings}
              isLoading={closedHoldings.isLoading}
              getRowId={(holding) => holding.id}
              stickyHeader
              centered
              ariaLabel="清仓历史"
              className="rounded-none border-0 bg-transparent shadow-none"
              empty={
                <EmptyState
                  icon={Archive}
                  title="还没有清仓历史"
                  description="数量调整为 0 并完成清仓确认的记录会保留在这里。"
                  className="min-h-64 rounded-none border-x-0 border-b-0 bg-transparent shadow-none"
                />
              }
              pagination={
                activeTab === "closed" && !closedHoldings.isLoading && closedItems.length > 0 ? (
                  <Pagination
                    page={currentHoldingPage}
                    totalPages={totalHoldingPages}
                    pageStart={holdingPageStart}
                    pageEnd={holdingPageEnd}
                    totalItems={activeHoldings.length}
                    onPageChange={goToHoldingPage}
                    compact
                    alwaysVisible
                    className="shrink-0"
                  />
                ) : undefined
              }
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HoldingsFilterBar({
  filters,
  onChange,
  onReset,
  onAdd,
}: {
  filters: HoldingsFilters;
  onChange: (filters: HoldingsFilters) => void;
  onReset: () => void;
  onAdd: () => void;
}) {
  const update = (patch: Partial<HoldingsFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="border-b border-border bg-transparent px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-label font-medium text-muted-foreground">
              <Search size={12} /> 代码 / 名称
            </label>
            <Input
              placeholder="输入代码或名称"
              value={filters.keyword}
              onChange={(event) => update({ keyword: event.target.value })}
              className="h-9"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-label font-medium text-muted-foreground">
              <Tags size={12} /> 类型
            </label>
            <select
              value={filters.asset_type}
              onChange={(event) => update({ asset_type: event.target.value as AssetType | "" })}
              className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="">全部类型</option>
              <option value="a_share">A 股</option>
              <option value="fund_etf">ETF</option>
            </select>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-label font-medium text-muted-foreground">
              <CalendarDays size={12} /> 建仓日期
            </label>
            <DateRangeField
              openedFrom={filters.opened_from}
              openedTo={filters.opened_to}
              onChange={(opened_from, opened_to) => onChange({ ...filters, opened_from, opened_to })}
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onReset} className="h-9">
            重置
          </Button>
          <Button type="button" size="sm" className="h-9" onClick={onAdd}>
            新增
          </Button>
        </div>
      </div>
    </div>
  );
}

function createOpenColumns(
  onEdit: (holding: Holding) => void,
  onDetails: (holding: Holding) => void,
  onDelete: (holding: Holding) => void,
  sort: HoldingSortState,
  onSort: (key: HoldingSortKey) => void,
  showDragHandle: boolean,
): ColumnDef<Holding, unknown>[] {
  return [
    {
      id: "instrument",
      header: "标的名称",
      cell: ({ row }) => <InstrumentCell holding={row.original} showDragHandle={showDragHandle} />,
      meta: { sticky: "left", headerClassName: "min-w-[176px]", cellClassName: "min-w-[176px]" },
    },
    {
      accessorKey: "asset_type",
      header: "类型",
      cell: ({ row }) => <Badge className="text-[13px]">{row.original.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>,
    },
    numericColumn("average_cost", "平均成本", (holding) => formatPoint(holding.average_cost, { group: false })),
    numericColumn("quantity", "数量", (holding) => holding.quantity.toLocaleString("zh-CN", { useGrouping: false })),
    numericColumn("latest", "最新价", (holding) => formatPoint(holding.latest, { group: false })),
    sortableColumn("market_value", "当前市值", "market_value", sort, onSort, (holding) => formatMoney(holding.market_value), "center"),
    sortableColumn(
      "floating_gain",
      "浮动盈亏",
      "floating_gain",
      sort,
      onSort,
      (holding) => <span className={movementClass(holding.floating_gain)}>{formatMoney(holding.floating_gain)}</span>,
      "center",
    ),
    sortableColumn(
      "floating_gain_percent",
      "盈亏率",
      "floating_gain_percent",
      sort,
      onSort,
      (holding) => <span className={movementClass(holding.floating_gain_percent)}>{formatPercent(holding.floating_gain_percent)}</span>,
      "center",
    ),
    numericColumn("change_percent", "今日涨跌", (holding) => (
      <span className={movementClass(holding.change_percent)}>{formatPercent(holding.change_percent)}</span>
    )),
    sortableColumn(
      "weight_percent",
      "组合占比",
      "weight_percent",
      sort,
      onSort,
      (holding) => formatPercentUnsigned(holding.weight_percent),
      "center",
    ),
    sortableColumn("opened_on", "建仓日期", "opened_on", sort, onSort, (holding) => formatDate(holding.opened_on)),
    {
      accessorKey: "note",
      header: "备注",
      cell: ({ row }) => (
        <span className="block max-w-44 truncate" title={row.original.note ?? ""}>
          {row.original.note || "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <RowActions holding={row.original} onDetails={onDetails} onEdit={onEdit} onDelete={onDelete} />,
      meta: { align: "center", sticky: "right", cellClassName: "w-[128px]" },
    },
  ];
}

function createClosedColumns(
  onEdit: (holding: Holding) => void,
  onDetails: (holding: Holding) => void,
  onDelete: (holding: Holding) => void,
  sort: HoldingSortState,
  onSort: (key: HoldingSortKey) => void,
): ColumnDef<Holding, unknown>[] {
  return [
    {
      id: "instrument",
      header: "标的名称",
      cell: ({ row }) => <InstrumentCell holding={row.original} />,
      meta: { sticky: "left", headerClassName: "min-w-[176px]", cellClassName: "min-w-[176px]" },
    },
    {
      accessorKey: "asset_type",
      header: "类型",
      cell: ({ row }) => <Badge className="text-[13px]">{row.original.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>,
    },
    numericColumn("average_cost", "原平均成本", (holding) => formatPoint(holding.average_cost, { group: false })),
    numericColumn(
      "closed_quantity",
      "清仓数量",
      (holding) => holding.closed_quantity?.toLocaleString("zh-CN", { useGrouping: false }) ?? "暂无数据",
    ),
    numericColumn("close_price", "清仓价格", (holding) => formatPoint(holding.close_price, { group: false })),
    numericColumn("close_amount", "清仓金额", (holding) => formatMoney(holding.close_amount)),
    numericColumn("realized_gain", "已实现盈亏", (holding) => (
      <span className={movementClass(holding.realized_gain)}>{formatMoney(holding.realized_gain)}</span>
    )),
    numericColumn("realized_gain_percent", "已实现盈亏率", (holding) => (
      <span className={movementClass(holding.realized_gain_percent)}>{formatPercent(holding.realized_gain_percent)}</span>
    )),
    sortableColumn("opened_on", "建仓日期", "opened_on", sort, onSort, (holding) => formatDate(holding.opened_on)),
    numericColumn("closed_on", "清仓日期", (holding) =>
      holding.closed_on ? formatDate(holding.closed_on) : formatDateTime(holding.closed_at),
    ),
    {
      accessorKey: "note",
      header: "备注",
      cell: ({ row }) => (
        <span className="block max-w-72 truncate" title={row.original.note ?? ""}>
          {row.original.note || "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <RowActions holding={row.original} onDetails={onDetails} onEdit={onEdit} onDelete={onDelete} />,
      meta: { align: "center", sticky: "right", cellClassName: "w-[128px]" },
    },
  ];
}

function numericColumn(id: keyof Holding, header: string, render: (holding: Holding) => ReactNode): ColumnDef<Holding, unknown> {
  return { id, header, cell: ({ row }) => render(row.original), meta: { align: "center" } };
}

function sortableColumn(
  id: keyof Holding,
  label: string,
  sortKey: HoldingSortKey,
  sort: HoldingSortState,
  onSort: (key: HoldingSortKey) => void,
  render: (holding: Holding) => ReactNode,
  align: "right" | "center" = "center",
): ColumnDef<Holding, unknown> {
  return {
    id,
    header: () => <SortHeader label={label} sortKey={sortKey} sort={sort} onSort={onSort} />,
    cell: ({ row }) => render(row.original),
    meta: { align, sortDirection: sort?.key === sortKey ? (sort.direction === "asc" ? "ascending" : "descending") : "none" },
  };
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: HoldingSortKey;
  sort: HoldingSortState;
  onSort: (key: HoldingSortKey) => void;
}) {
  const isActive = sort?.key === sortKey;
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => onSort(sortKey)}
      aria-label={`按${label}${isActive && sort.direction === "desc" ? "降序" : "升序"}排序`}
    >
      {label}
      {isActive ? sort.direction === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} /> : <ArrowUpDown size={13} />}
    </button>
  );
}

function InstrumentCell({ holding, showDragHandle = false }: { holding: Holding; showDragHandle?: boolean }) {
  return (
    <div className="relative flex w-full items-center justify-center">
      {showDragHandle && <GripVertical className="absolute left-0 shrink-0 text-muted-foreground/45" size={14} aria-hidden="true" />}
      <div className="min-w-0 text-center">
        <p className="font-semibold text-foreground">{holding.name}</p>
        <p className="mt-1 font-mono text-[13px] tracking-[0.04em] text-muted-foreground/60">{holding.thscode}</p>
      </div>
    </div>
  );
}

function RowActions({
  holding,
  onDetails,
  onEdit,
  onDelete,
}: {
  holding: Holding;
  onDetails: (holding: Holding) => void;
  onEdit: (holding: Holding) => void;
  onDelete: (holding: Holding) => void;
}) {
  return (
    <div className="flex justify-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={() => onDetails(holding)}
        aria-label={`查看 ${holding.name}详情`}
        title="查看详情"
      >
        <FileText size={15} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={() => onEdit(holding)}
        aria-label={`编辑 ${holding.name}`}
        title="编辑"
      >
        <Edit3 size={15} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-9 text-danger hover:bg-danger/10 hover:text-danger"
        onClick={() => onDelete(holding)}
        aria-label={`删除 ${holding.name}`}
        title="删除"
      >
        <Trash2 size={15} />
      </Button>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return "暂无数据";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(date)
    .replaceAll("/", "-");
}

function formatPercentUnsigned(value: number | null): string {
  return value === null ? "暂无数据" : `${value.toFixed(2)}%`;
}
