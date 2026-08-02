import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DataTable } from "../../components/data-table";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatPoint,
  movementClass,
} from "../../lib/formatters";
import { cn } from "../../lib/utils";
import { HoldingDialog } from "./holding-dialog";
import { DateRangeField } from "./date-range-field";
import {
  useDeleteHoldingMutation,
  useHoldingsQuery,
  useHoldingSummaryQuery,
} from "./queries";
import type { AssetType, Holding, HoldingStatus, HoldingSummary, HoldingsFilters } from "./types";

const DEFAULT_FILTERS: HoldingsFilters = {
  keyword: "",
  asset_type: "",
  opened_from: "",
  opened_to: "",
};

export function HoldingsPage() {
  const [activeTab, setActiveTab] = useState<HoldingStatus>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);
  const [filters, setFilters] = useState<HoldingsFilters>(DEFAULT_FILTERS);
  const openHoldings = useHoldingsQuery("open", filters);
  const closedHoldings = useHoldingsQuery("closed", filters);
  const summary = useHoldingSummaryQuery();
  const deleteMutation = useDeleteHoldingMutation();

  const openColumns = useMemo(
    () => createOpenColumns((holding) => openEditor(holding), setDeleteTarget),
    [],
  );
  const closedColumns = useMemo(
    () => createClosedColumns((holding) => openEditor(holding), setDeleteTarget),
    [],
  );

  function openEditor(holding: Holding | null) {
    setEditingHolding(holding);
    setDialogOpen(true);
  }

  const refresh = async () => {
    await Promise.all([openHoldings.refetch(), closedHoldings.refetch(), summary.refetch()]);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    }
  };

  const source = openHoldings.data?.data_source ?? summary.data?.data_source;
  const marketStatus = openHoldings.data?.market_status ?? summary.data?.market_status ?? "未知";

  return (
    <div className="mx-auto max-w-[1560px] animate-enter">
      <div className="mb-8 flex items-end justify-between gap-8">
        <div>
          <p className="eyebrow text-primary/90">POSITION LEDGER / 持仓账簿</p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">持仓管理</h1>
          <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
            维护当前仓位与清仓档案；行情只用于估值，不改写你的成本和数量。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => void refresh()} disabled={openHoldings.isFetching || summary.isFetching}>
            <RefreshCw className={cn((openHoldings.isFetching || summary.isFetching) && "animate-spin")} size={15} />
            刷新行情
          </Button>
          <Button onClick={() => openEditor(null)}>
            <Plus size={17} /> 新增持仓
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SummaryCards summary={summary.data} isLoading={summary.isLoading} />
        <FilterBar filters={filters} onChange={setFilters} />
      </section>

      {summary.data?.incomplete && summary.data.holding_count > 0 && (
        <div className="mt-3 flex items-center gap-2.5 rounded-r-xl border-l-4 border-primary bg-primary/8 px-5 py-3.5 text-[0.85rem] text-primary/90">
          <AlertTriangle size={16} />
          <span className="leading-relaxed">部分持仓行情缺失，汇总数据不完整；缺失值没有按 0 计算。</span>
        </div>
      )}

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

      <div className="mt-8">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as HoldingStatus)}>
          <div className="mb-3 flex items-end justify-between border-b border-border">
            <TabsList className="h-auto gap-7 bg-transparent p-0">
              <TabsTrigger
                value="open"
                className="relative h-12 gap-2 rounded-none border-0 bg-transparent px-0 text-[0.95rem] text-muted-foreground/60 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:h-0.5 after:w-full after:scale-x-0 after:bg-primary after:transition data-[state=active]:after:scale-x-100"
              >
                当前持仓
                <span className="font-mono text-[0.65rem] text-muted-foreground/60">{openHoldings.data?.items.length ?? 0}</span>
              </TabsTrigger>
              <TabsTrigger
                value="closed"
                className="relative h-12 gap-2 rounded-none border-0 bg-transparent px-0 text-[0.95rem] text-muted-foreground/60 shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:h-0.5 after:w-full after:scale-x-0 after:bg-primary after:transition data-[state=active]:after:scale-x-100"
              >
                已清仓
                <span className="font-mono text-[0.65rem] text-muted-foreground/60">{closedHoldings.data?.items.length ?? 0}</span>
              </TabsTrigger>
            </TabsList>
            <div className="mb-3 flex items-center gap-3 text-[0.7rem] tracking-[0.05em] text-muted-foreground/60">
              <span className={cn("size-1.5 rounded-full", marketStatus === "交易中" ? "bg-market-down" : "bg-primary")} />
              {activeTab === "open" ? `市场 · ${marketStatus}` : "历史记录 · 不轮询行情"}
              {openHoldings.data?.stale && <Badge variant="warning">最后成功行情</Badge>}
            </div>
          </div>

          <TabsContent value="open" className="mt-0">
            {openHoldings.isError && <LoadError onRetry={() => void openHoldings.refetch()} />}
            {!openHoldings.isError && (
              <DataTable
                columns={openColumns}
                data={openHoldings.data?.items ?? []}
                isLoading={openHoldings.isLoading}
                getRowId={(holding) => holding.id}
                empty={<EmptyState status="open" onAdd={() => openEditor(null)} />}
              />
            )}
          </TabsContent>

          <TabsContent value="closed" className="mt-0">
            {closedHoldings.isError && <LoadError onRetry={() => void closedHoldings.refetch()} />}
            {!closedHoldings.isError && (
              <DataTable
                columns={closedColumns}
                data={closedHoldings.data?.items ?? []}
                isLoading={closedHoldings.isLoading}
                getRowId={(holding) => holding.id}
                empty={<EmptyState status="closed" onAdd={() => openEditor(null)} />}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <HoldingDialog open={dialogOpen} onOpenChange={setDialogOpen} holding={editingHolding} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              该操作不可撤销，将删除这条{deleteTarget?.status === "closed" ? "清仓历史" : "当前持仓"}记录。
              {deleteTarget?.status === "open" && " 如需保留历史，请编辑数量为 0 执行清仓。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && (
            <div role="alert" className="mt-4 border-l-2 border-market-up bg-danger/10 px-4 py-3 text-sm text-market-up">
              删除失败，请稍后重试
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>
              确认永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCards({ summary, isLoading }: { summary?: HoldingSummary; isLoading: boolean }) {
  const metrics = [
    {
      label: "总成本",
      value: summary ? formatMoney(summary.total_cost) : "—",
      icon: BriefcaseBusiness,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "总市值",
      value: summary ? formatMoney(summary.total_market_value) : "—",
      icon: CircleDollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "浮动盈亏",
      value: summary ? formatMoney(summary.floating_gain) : "—",
      icon: (summary?.floating_gain ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight,
      movement: summary?.floating_gain ?? null,
      colorClass: movementClass(summary?.floating_gain ?? null),
      bg: "bg-amber-500/10",
    },
    {
      label: "浮动盈亏率",
      value: summary ? formatPercent(summary.floating_gain_percent) : "—",
      icon: (summary?.floating_gain_percent ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight,
      movement: summary?.floating_gain_percent ?? null,
      colorClass: movementClass(summary?.floating_gain_percent ?? null),
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <section className="grid h-full grid-cols-1 gap-5 sm:grid-cols-2">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div
            key={metric.label}
            className="relative overflow-hidden rounded-xl border border-border bg-card px-5 py-4 shadow-raised transition-shadow hover:shadow-lg"
          >
            <div className={cn("absolute right-4 top-4 rounded-lg p-2", metric.bg)}>
              <Icon className={cn("size-5", metric.color)} />
            </div>
            <p className="text-[0.8rem] font-medium tracking-wide text-muted-foreground/70">{metric.label}</p>
            {isLoading ? (
              <div className="mt-4 h-8 w-2/3 animate-pulse rounded-full bg-secondary" />
            ) : (
              <p
                className={cn(
                  "mt-2 font-display text-[1.45rem] leading-none tracking-tight",
                  metric.colorClass ?? "text-foreground",
                )}
              >
                {metric.value}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

interface FilterBarProps {
  filters: HoldingsFilters;
  onChange: (filters: HoldingsFilters) => void;
  className?: string;
}

function FilterBar({ filters, onChange, className }: FilterBarProps) {
  const update = (patch: Partial<HoldingsFilters>) => onChange({ ...filters, ...patch });
  const reset = () => onChange(DEFAULT_FILTERS);
  const activeCount = [filters.keyword, filters.asset_type, filters.opened_from, filters.opened_to].filter(
    Boolean,
  ).length;

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-raised", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal size={15} className="text-primary/80" />
          筛选条件
          {activeCount > 0 && (
            <Badge variant="neutral" className="ml-1 h-5 px-1.5 text-[0.7rem]">
              {activeCount}
            </Badge>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reset} className="h-8 px-3">
          重置
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-medium text-muted-foreground">
            <Search size={12} /> 代码 / 名称
          </label>
          <Input
            placeholder="输入代码或名称"
            value={filters.keyword}
            onChange={(e) => update({ keyword: e.target.value })}
            className="h-9"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-medium text-muted-foreground">
            类型
          </label>
          <div className="relative">
            <select
              value={filters.asset_type}
              onChange={(e) => update({ asset_type: e.target.value as AssetType | "" })}
              className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground outline-none ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">全部类型</option>
              <option value="a_share">A 股</option>
              <option value="fund_etf">ETF</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60">
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-medium text-muted-foreground">
            <CalendarDays size={12} /> 建仓日期
          </label>
          <DateRangeField
            openedFrom={filters.opened_from}
            openedTo={filters.opened_to}
            onChange={(opened_from, opened_to) => onChange({ ...filters, opened_from, opened_to })}
          />
        </div>
      </div>
    </div>
  );
}

function createOpenColumns(
  onEdit: (holding: Holding) => void,
  onDelete: (holding: Holding) => void,
): ColumnDef<Holding, unknown>[] {
  return [
    {
      id: "instrument",
      header: "标的名称",
      cell: ({ row }) => <InstrumentCell holding={row.original} />,
      meta: {
        headerClassName: "sticky left-0 z-[1] min-w-[176px] bg-card",
        cellClassName: "sticky left-0 z-[1] min-w-[176px] bg-card group-hover:bg-secondary",
      },
    },
    {
      accessorKey: "asset_type",
      header: "类型",
      cell: ({ row }) => <Badge>{row.original.asset_type === "a_share" ? "A 股" : "ETF"}</Badge>,
    },
    numericColumn("average_cost", "平均成本", (holding) => formatPoint(holding.average_cost)),
    numericColumn("quantity", "数量", (holding) => holding.quantity.toLocaleString("zh-CN")),
    numericColumn("cost_amount", "成本金额", (holding) => formatMoney(holding.cost_amount)),
    numericColumn("latest", "最新价", (holding) => formatPoint(holding.latest)),
    numericColumn("market_value", "当前市值", (holding) => formatMoney(holding.market_value)),
    numericColumn("floating_gain", "浮动盈亏", (holding) => (
      <span className={movementClass(holding.floating_gain)}>{formatMoney(holding.floating_gain)}</span>
    )),
    numericColumn("floating_gain_percent", "盈亏率", (holding) => (
      <span className={movementClass(holding.floating_gain_percent)}>
        {formatPercent(holding.floating_gain_percent)}
      </span>
    )),
    numericColumn("change_percent", "今日涨跌", (holding) => (
      <span className={movementClass(holding.change_percent)}>{formatPercent(holding.change_percent)}</span>
    )),
    numericColumn("weight_percent", "持仓占比", (holding) => formatPercentUnsigned(holding.weight_percent)),
    { accessorKey: "opened_on", header: "建仓日期", cell: ({ row }) => formatDate(row.original.opened_on) },
    {
      accessorKey: "note",
      header: "备注",
      cell: ({ row }) => <span className="block max-w-44 truncate" title={row.original.note ?? ""}>{row.original.note || "—"}</span>,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <RowActions holding={row.original} onEdit={onEdit} onDelete={onDelete} />,
      meta: {
        align: "right",
        headerClassName: "sticky right-0 z-[1] bg-card",
        cellClassName: "sticky right-0 z-[1] w-[96px] bg-card group-hover:bg-secondary",
      },
    },
  ];
}

function createClosedColumns(
  onEdit: (holding: Holding) => void,
  onDelete: (holding: Holding) => void,
): ColumnDef<Holding, unknown>[] {
  return [
    {
      id: "instrument",
      header: "标的名称",
      cell: ({ row }) => <InstrumentCell holding={row.original} />,
      meta: {
        headerClassName: "sticky left-0 z-[1] min-w-[176px] bg-card",
        cellClassName: "sticky left-0 z-[1] min-w-[176px] bg-card group-hover:bg-secondary",
      },
    },
    { accessorKey: "asset_type", header: "类型", cell: ({ row }) => <Badge>{row.original.asset_type === "a_share" ? "A 股" : "ETF"}</Badge> },
    numericColumn("average_cost", "原平均成本", (holding) => formatPoint(holding.average_cost)),
    { accessorKey: "opened_on", header: "建仓日期", cell: ({ row }) => formatDate(row.original.opened_on) },
    { accessorKey: "closed_at", header: "清仓时间", cell: ({ row }) => formatDateTime(row.original.closed_at) },
    {
      accessorKey: "note",
      header: "备注",
      cell: ({ row }) => <span className="block max-w-72 truncate" title={row.original.note ?? ""}>{row.original.note || "—"}</span>,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <RowActions holding={row.original} onEdit={onEdit} onDelete={onDelete} />,
      meta: {
        align: "right",
        headerClassName: "sticky right-0 z-[1] bg-card",
        cellClassName: "sticky right-0 z-[1] bg-card group-hover:bg-secondary",
      },
    },
  ];
}

function numericColumn(
  id: keyof Holding,
  header: string,
  render: (holding: Holding) => React.ReactNode,
): ColumnDef<Holding, unknown> {
  return {
    id,
    header,
    cell: ({ row }) => render(row.original),
    meta: { align: "right" },
  };
}

function InstrumentCell({ holding }: { holding: Holding }) {
  return (
    <div>
      <p className="font-semibold text-foreground">{holding.name}</p>
      <p className="mt-1 font-mono text-[0.75rem] tracking-[0.04em] text-muted-foreground/60">{holding.thscode}</p>
    </div>
  );
}

function RowActions({
  holding,
  onEdit,
  onDelete,
}: {
  holding: Holding;
  onEdit: (holding: Holding) => void;
  onDelete: (holding: Holding) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" className="size-9" onClick={() => onEdit(holding)} aria-label={`编辑 ${holding.name}`} title="编辑">
        <Edit3 size={15} />
      </Button>
      <Button variant="ghost" size="icon" className="size-9 text-danger hover:bg-danger/10 hover:text-danger" onClick={() => onDelete(holding)} aria-label={`删除 ${holding.name}`} title="删除">
        <Trash2 size={15} />
      </Button>
    </div>
  );
}

function EmptyState({ status, onAdd }: { status: HoldingStatus; onAdd: () => void }) {
  const isOpen = status === "open";
  return (
    <div className="grid min-h-64 place-items-center border-t border-border px-6 py-14 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-secondary text-muted-foreground/60">
          {isOpen ? <BriefcaseBusiness size={19} /> : <Archive size={19} />}
        </span>
        <h3 className="mt-4 font-display text-[1.4rem] tracking-tight text-foreground">{isOpen ? "还没有当前持仓" : "还没有清仓记录"}</h3>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-7 text-muted-foreground">
          {isOpen ? "从数据源检索 A 股或 ETF，记录一条不依赖券商连接的私有持仓。" : "数量调整为 0 的记录会自动归档到这里。"}
        </p>
        {isOpen && <Button className="mt-6" size="sm" onClick={onAdd}><Plus size={14} /> 添加第一条持仓</Button>}
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-xl border border-border bg-card text-center shadow-raised">
      <div>
        <AlertTriangle className="mx-auto text-market-up" size={24} />
        <h3 className="mt-4 font-display text-[1.4rem] tracking-tight text-foreground">持仓记录加载失败</h3>
        <Button className="mt-5" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return "暂无数据";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("/", "-");
}

function formatPercentUnsigned(value: number | null): string {
  return value === null ? "暂无数据" : `${value.toFixed(2)}%`;
}
