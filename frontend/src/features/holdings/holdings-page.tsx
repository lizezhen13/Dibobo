import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CircleDollarSign,
  Edit3,
  Plus,
  RefreshCw,
  Settings,
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
import {
  useDeleteHoldingMutation,
  useHoldingsQuery,
  useHoldingSummaryQuery,
} from "./queries";
import type { Holding, HoldingStatus, HoldingSummary } from "./types";

export function HoldingsPage() {
  const [activeTab, setActiveTab] = useState<HoldingStatus>("open");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holding | null>(null);
  const openHoldings = useHoldingsQuery("open");
  const closedHoldings = useHoldingsQuery("closed");
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
    await Promise.all([openHoldings.refetch(), summary.refetch()]);
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
      <div className="mb-7 flex items-end justify-between gap-8">
        <div>
          <p className="mb-3 font-mono text-[10px] tracking-[.18em] text-accent-deep">
            POSITION LEDGER / 持仓账簿
          </p>
          <h1 className="font-display text-[38px] leading-tight tracking-[-.025em] text-ink">持仓管理</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            维护当前仓位与清仓档案；行情只用于估值，不改写你的成本和数量。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => void refresh()} disabled={openHoldings.isFetching || summary.isFetching}>
            <RefreshCw className={cn((openHoldings.isFetching || summary.isFetching) && "animate-spin")} size={15} />
            刷新行情
          </Button>
          <Button onClick={() => openEditor(null)}>
            <Plus size={16} /> 新增持仓
          </Button>
        </div>
      </div>

      <SummaryStrip summary={summary.data} isLoading={summary.isLoading} />

      {summary.data?.incomplete && summary.data.holding_count > 0 && (
        <div className="mt-3 flex items-center gap-2 border-l-2 border-accent bg-accent/7 px-4 py-3 text-xs text-accent-deep">
          <AlertTriangle size={15} /> 部分持仓行情缺失，汇总数据不完整；缺失值没有按 0 计算。
        </div>
      )}

      {source && source.state !== "ready" && (
        <div className="mt-4 flex items-center justify-between gap-6 border border-line bg-paper px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent-deep">
              <Settings size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">行情连接未就绪</p>
              <p className="mt-1 text-xs text-ink-muted">{source.message ?? "请检查当前启用的数据源"}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">前往系统设置</Link>
          </Button>
        </div>
      )}

      <div className="mt-7">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as HoldingStatus)}>
          <div className="mb-3 flex items-end justify-between border-b border-line">
            <TabsList className="h-auto gap-7 bg-transparent p-0">
              <TabsTrigger
                value="open"
                className="relative h-11 rounded-none border-0 bg-transparent px-0 text-sm text-ink-faint shadow-none data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:h-0.5 after:w-full after:scale-x-0 after:bg-accent after:transition data-[state=active]:after:scale-x-100"
              >
                当前持仓
                <span className="font-mono text-[9px] text-ink-faint">{openHoldings.data?.items.length ?? 0}</span>
              </TabsTrigger>
              <TabsTrigger
                value="closed"
                className="relative h-11 rounded-none border-0 bg-transparent px-0 text-sm text-ink-faint shadow-none data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none after:absolute after:bottom-[-1px] after:left-0 after:h-0.5 after:w-full after:scale-x-0 after:bg-accent after:transition data-[state=active]:after:scale-x-100"
              >
                已清仓
                <span className="font-mono text-[9px] text-ink-faint">{closedHoldings.data?.items.length ?? 0}</span>
              </TabsTrigger>
            </TabsList>
            <div className="mb-3 flex items-center gap-3 text-[10px] text-ink-faint">
              <span className={cn("size-1.5 rounded-full", marketStatus === "交易中" ? "bg-market-down" : "bg-accent")} />
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
            <div role="alert" className="mt-4 border-l-2 border-market-up bg-market-up/6 px-4 py-3 text-sm text-market-up">
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

function SummaryStrip({ summary, isLoading }: { summary?: HoldingSummary; isLoading: boolean }) {
  const metrics = [
    { label: "总成本", value: summary ? formatMoney(summary.total_cost) : "—", icon: BriefcaseBusiness },
    { label: "可计算市值", value: summary ? formatMoney(summary.total_market_value) : "—", icon: CircleDollarSign },
    {
      label: "浮动盈亏",
      value: summary ? formatMoney(summary.floating_gain) : "—",
      icon: (summary?.floating_gain ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight,
      movement: summary?.floating_gain ?? null,
    },
    {
      label: "浮动盈亏率",
      value: summary ? formatPercent(summary.floating_gain_percent) : "—",
      icon: (summary?.floating_gain_percent ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight,
      movement: summary?.floating_gain_percent ?? null,
    },
  ];
  return (
    <div className="grid grid-cols-4 divide-x divide-line overflow-hidden rounded-[4px] border border-line bg-paper shadow-[0_18px_60px_rgba(23,33,29,.04)]">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <div key={metric.label} className="relative px-5 py-5">
            <span className="absolute right-4 top-4 font-mono text-[9px] text-ink-faint">0{index + 1}</span>
            <div className="flex items-center gap-2 text-[10px] tracking-[.12em] text-ink-faint">
              <Icon size={14} /> {metric.label}
            </div>
            {isLoading ? (
              <div className="mt-4 h-7 w-2/3 animate-pulse rounded-full bg-ink/7" />
            ) : (
              <p className={cn("mt-3 font-display text-[25px] tracking-[-.02em] text-ink", movementClass(metric.movement ?? null))}>
                {metric.value}
              </p>
            )}
          </div>
        );
      })}
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
      header: "标的",
      cell: ({ row }) => <InstrumentCell holding={row.original} />,
      meta: { cellClassName: "sticky left-0 z-[1] min-w-[176px] bg-paper group-hover:bg-[#f2eee4]" },
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
      meta: { align: "right", cellClassName: "sticky right-0 z-[1] bg-paper group-hover:bg-[#f2eee4]" },
    },
  ];
}

function createClosedColumns(
  onEdit: (holding: Holding) => void,
  onDelete: (holding: Holding) => void,
): ColumnDef<Holding, unknown>[] {
  return [
    { id: "instrument", header: "标的", cell: ({ row }) => <InstrumentCell holding={row.original} /> },
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
      meta: { align: "right" },
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
      <p className="font-semibold text-ink">{holding.name}</p>
      <p className="mt-1 font-mono text-[10px] tracking-[.04em] text-ink-faint">{holding.thscode}</p>
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
      <Button variant="ghost" size="icon" onClick={() => onEdit(holding)} aria-label={`编辑 ${holding.name}`} title="编辑">
        <Edit3 size={14} />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(holding)} aria-label={`删除 ${holding.name}`} title="删除">
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

function EmptyState({ status, onAdd }: { status: HoldingStatus; onAdd: () => void }) {
  const isOpen = status === "open";
  return (
    <div className="grid min-h-64 place-items-center border-t border-line px-6 py-12 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-line bg-paper-deep text-ink-faint">
          {isOpen ? <BriefcaseBusiness size={19} /> : <Archive size={19} />}
        </span>
        <h3 className="mt-4 font-display text-xl text-ink">{isOpen ? "还没有当前持仓" : "还没有清仓记录"}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
          {isOpen ? "从数据源检索 A 股或 ETF，记录一条不依赖券商连接的私有持仓。" : "数量调整为 0 的记录会自动归档到这里。"}
        </p>
        {isOpen && <Button className="mt-5" size="sm" onClick={onAdd}><Plus size={14} /> 添加第一条持仓</Button>}
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-[4px] border border-line bg-paper text-center">
      <div>
        <AlertTriangle className="mx-auto text-market-up" size={22} />
        <h3 className="mt-3 font-display text-xl text-ink">持仓记录加载失败</h3>
        <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>
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
