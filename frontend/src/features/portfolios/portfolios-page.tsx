import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  ArrowUpDown,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Edit3,
  GripVertical,
  Layers3,
  Orbit,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import { DateRangeField } from "../holdings/date-range-field";
import {
  useDeleteHoldingMutation,
  useDeletePortfolioMutation,
  usePortfolioHoldingsQuery,
  usePortfolioSummaryQuery,
  usePortfolioSummariesQuery,
  usePortfoliosQuery,
  useReorderPortfolioHoldingsMutation,
  useReorderPortfoliosMutation,
  useSetDefaultPortfolioMutation,
} from "../holdings/queries";
import type {
  AssetType,
  Holding,
  HoldingStatus,
  HoldingSummary,
  HoldingsFilters,
  Portfolio,
} from "../holdings/types";

const HoldingDialog = lazy(() =>
  import("../holdings/holding-dialog").then(({ HoldingDialog: Dialog }) => ({ default: Dialog })),
);
const PortfolioDialog = lazy(() =>
  import("./portfolio-dialog").then(({ PortfolioDialog: Dialog }) => ({ default: Dialog })),
);

const DEFAULT_FILTERS: HoldingsFilters = {
  keyword: "",
  asset_type: "",
  opened_from: "",
  opened_to: "",
};
const HOLDINGS_PAGE_SIZE = 10;

type HoldingSortKey =
  | "market_value"
  | "floating_gain"
  | "floating_gain_percent"
  | "weight_percent"
  | "opened_on";

type HoldingSortState = {
  key: HoldingSortKey;
  direction: "asc" | "desc";
} | null;

export function PortfoliosPage() {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>();
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [deletePortfolioTarget, setDeletePortfolioTarget] = useState<Portfolio | null>(null);
  const [activeTab, setActiveTab] = useState<HoldingStatus>("open");
  const [holdingDialogOpen, setHoldingDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [deleteHoldingTarget, setDeleteHoldingTarget] = useState<Holding | null>(null);
  const [filters, setFilters] = useState<HoldingsFilters>(DEFAULT_FILTERS);
  const [holdingSort, setHoldingSort] = useState<HoldingSortState>(null);
  const [openOrderIds, setOpenOrderIds] = useState<string[]>([]);
  const [holdingPage, setHoldingPage] = useState(1);

  const portfoliosQuery = usePortfoliosQuery();
  const portfolios = portfoliosQuery.data?.items ?? [];
  const selectedPortfolio = portfolios.find((portfolio) => portfolio.id === selectedPortfolioId) ?? null;
  const openHoldings = usePortfolioHoldingsQuery(
    selectedPortfolioId,
    "open",
    filters,
    activeTab === "open",
  );
  const closedHoldings = usePortfolioHoldingsQuery(
    selectedPortfolioId,
    "closed",
    filters,
    activeTab === "closed",
  );
  const summary = usePortfolioSummaryQuery(selectedPortfolioId);
  const deleteHoldingMutation = useDeleteHoldingMutation(selectedPortfolioId);
  const deletePortfolioMutation = useDeletePortfolioMutation();
  const setDefaultMutation = useSetDefaultPortfolioMutation();
  const reorderHoldingsMutation = useReorderPortfolioHoldingsMutation(selectedPortfolioId);
  const reorderMutation = useReorderPortfoliosMutation();

  useEffect(() => {
    if (portfolios.length === 0) {
      setSelectedPortfolioId(undefined);
      return;
    }
    if (selectedPortfolioId && portfolios.some((portfolio) => portfolio.id === selectedPortfolioId)) {
      return;
    }
    const fallback = portfolios.find((portfolio) => portfolio.is_default) ?? portfolios[0];
    if (fallback) setSelectedPortfolioId(fallback.id);
  }, [portfolios, selectedPortfolioId]);

  const openItems = openHoldings.data?.items ?? [];
  const closedItems = closedHoldings.data?.items ?? [];
  const hasHoldingFilters = Boolean(
    filters.keyword.trim() ||
      filters.asset_type ||
      filters.opened_from ||
      filters.opened_to,
  );
  const canReorderOpen =
    activeTab === "open" &&
    !hasHoldingFilters &&
    holdingSort === null &&
    openItems.length > 1 &&
    !reorderHoldingsMutation.isPending;

  useEffect(() => {
    setHoldingSort(null);
    setOpenOrderIds([]);
    setHoldingPage(1);
  }, [selectedPortfolioId]);

  useEffect(() => {
    setHoldingSort(null);
    setHoldingPage(1);
  }, [activeTab]);

  useEffect(() => {
    setHoldingPage(1);
  }, [filters.asset_type, filters.keyword, filters.opened_from, filters.opened_to, holdingSort?.direction, holdingSort?.key]);

  useEffect(() => {
    if (hasHoldingFilters || openHoldings.isFetching || !openHoldings.data) return;
    const itemIds = openItems.map((holding) => holding.id);
    setOpenOrderIds((current) => {
      const next = reconcileOrderIds(current, itemIds);
      return sameStringArray(current, next) ? current : next;
    });
  }, [hasHoldingFilters, openHoldings.data, openHoldings.isFetching, openItems]);

  const orderedOpenHoldings = useMemo(
    () => applyHoldingOrder(openItems, openOrderIds),
    [openItems, openOrderIds],
  );
  const sortedOpenHoldings = useMemo(
    () => sortHoldings(orderedOpenHoldings, holdingSort),
    [holdingSort, orderedOpenHoldings],
  );
  const sortedClosedHoldings = useMemo(
    () => sortHoldings(closedItems, holdingSort),
    [closedItems, holdingSort],
  );
  const activeHoldings = activeTab === "open" ? sortedOpenHoldings : sortedClosedHoldings;
  const totalHoldingPages = Math.max(1, Math.ceil(activeHoldings.length / HOLDINGS_PAGE_SIZE));
  const currentHoldingPage = Math.min(holdingPage, totalHoldingPages);
  const holdingPageOffset = (currentHoldingPage - 1) * HOLDINGS_PAGE_SIZE;
  const pagedOpenHoldings = sortedOpenHoldings.slice(
    holdingPageOffset,
    holdingPageOffset + HOLDINGS_PAGE_SIZE,
  );
  const pagedClosedHoldings = sortedClosedHoldings.slice(
    holdingPageOffset,
    holdingPageOffset + HOLDINGS_PAGE_SIZE,
  );
  const holdingPageStart = activeHoldings.length === 0 ? 0 : holdingPageOffset + 1;
  const holdingPageEnd = Math.min(holdingPageOffset + HOLDINGS_PAGE_SIZE, activeHoldings.length);

  useEffect(() => {
    if (holdingPage > totalHoldingPages) setHoldingPage(totalHoldingPages);
  }, [holdingPage, totalHoldingPages]);

  const openColumns = useMemo(
    () =>
      createOpenColumns(
        (holding) => openHoldingEditor(holding),
        setDeleteHoldingTarget,
        holdingSort,
        toggleHoldingSort,
        canReorderOpen,
      ),
    [canReorderOpen, holdingSort],
  );
  const closedColumns = useMemo(
    () =>
      createClosedColumns(
        (holding) => openHoldingEditor(holding),
        setDeleteHoldingTarget,
        holdingSort,
        toggleHoldingSort,
      ),
    [holdingSort],
  );

  function toggleHoldingSort(key: HoldingSortKey) {
    setHoldingSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  function resetHoldingList() {
    setFilters({ ...DEFAULT_FILTERS });
    setHoldingSort(null);
    setOpenOrderIds([]);
    setHoldingPage(1);
  }

  function goToHoldingPage(nextPage: number) {
    const boundedPage = Math.max(1, Math.min(nextPage, totalHoldingPages));
    setHoldingPage(boundedPage);
  }

  function openPortfolioEditor(portfolio: Portfolio | null) {
    setEditingPortfolio(portfolio);
    setPortfolioDialogOpen(true);
  }

  function openHoldingEditor(holding: Holding | null) {
    setEditingHolding(holding);
    setHoldingDialogOpen(true);
  }

  const refresh = async () => {
    await Promise.all([
      portfoliosQuery.refetch(),
      selectedPortfolioId && activeTab === "open" ? openHoldings.refetch() : Promise.resolve(),
      selectedPortfolioId && activeTab === "closed" ? closedHoldings.refetch() : Promise.resolve(),
      selectedPortfolioId ? summary.refetch() : Promise.resolve(),
    ]);
  };

  const confirmDeleteHolding = async () => {
    if (!deleteHoldingTarget) return;
    try {
      await deleteHoldingMutation.mutateAsync(deleteHoldingTarget.id);
      setDeleteHoldingTarget(null);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    }
  };

  const confirmDeletePortfolio = async () => {
    if (!deletePortfolioTarget) return;
    try {
      await deletePortfolioMutation.mutateAsync(deletePortfolioTarget.id);
      setDeletePortfolioTarget(null);
      setSelectedPortfolioId(undefined);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    }
  };

  const setDefault = async () => {
    if (!selectedPortfolio) return;
    try {
      await setDefaultMutation.mutateAsync(selectedPortfolio.id);
    } catch {
      // The mutation error is rendered in the portfolio header.
    }
  };

  const movePortfolio = async (portfolio: Portfolio, direction: -1 | 1) => {
    const currentIndex = portfolios.findIndex((item) => item.id === portfolio.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= portfolios.length) return;
    const reordered = [...portfolios];
    const current = reordered[currentIndex];
    const target = reordered[targetIndex];
    if (!current || !target) return;
    reordered[currentIndex] = target;
    reordered[targetIndex] = current;
    try {
      await reorderMutation.mutateAsync(reordered.map((item) => item.id));
    } catch {
      // The list query remains available so the user can retry.
    }
  };

  const reorderOpenHoldings = async (activeId: string, overId: string) => {
    if (!canReorderOpen || activeId === overId) return;
    const currentOrder = reconcileOrderIds(
      openOrderIds,
      openItems.map((holding) => holding.id),
    );
    const activeIndex = currentOrder.indexOf(activeId);
    const overIndex = currentOrder.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return;

    const nextOrder = [...currentOrder];
    const [movedId] = nextOrder.splice(activeIndex, 1);
    if (!movedId) return;
    nextOrder.splice(overIndex, 0, movedId);
    setOpenOrderIds(nextOrder);

    try {
      await reorderHoldingsMutation.mutateAsync(nextOrder);
    } catch {
      setOpenOrderIds(currentOrder);
    }
  };

  const source = openHoldings.data?.data_source ?? summary.data?.data_source;
  const marketStatus = openHoldings.data?.market_status ?? summary.data?.market_status ?? "未知";
  const isRefreshing =
    portfoliosQuery.isFetching || openHoldings.isFetching || summary.isFetching;

  return (
    <div className="portfolio-page mx-auto flex min-h-0 max-w-[1700px] flex-col animate-enter">
      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[276px_minmax(0,1fr)] xl:items-stretch">
        <PortfolioRail
          portfolios={portfolios}
          selectedId={selectedPortfolioId}
          isLoading={portfoliosQuery.isLoading}
          isReordering={reorderMutation.isPending}
          onSelect={setSelectedPortfolioId}
          onCreate={() => openPortfolioEditor(null)}
          onMove={movePortfolio}
        />

        <main className="flex min-h-0 min-w-0 flex-col">
          {portfoliosQuery.isError ? (
            <LoadError title="投资组合加载失败" onRetry={() => void portfoliosQuery.refetch()} />
          ) : selectedPortfolio ? (
            <>
              <PortfolioHeader
                portfolio={selectedPortfolio}
                marketStatus={marketStatus}
                summary={summary.data}
                isSummaryLoading={summary.isLoading}
                onRefresh={() => void refresh()}
                isRefreshing={isRefreshing}
                onEdit={() => openPortfolioEditor(selectedPortfolio)}
                onDelete={() => setDeletePortfolioTarget(selectedPortfolio)}
                onSetDefault={() => void setDefault()}
                isSettingDefault={setDefaultMutation.isPending}
                error={setDefaultMutation.error}
              />

              {summary.data?.incomplete && summary.data.holding_count > 0 && (
                <div className="mt-4 flex shrink-0 items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/8 px-5 py-3.5 text-[0.85rem] text-primary/90">
                  <AlertTriangle size={16} />
                  <span className="leading-relaxed">
                    部分持仓行情缺失，组合汇总不完整；缺失值没有按 0 计算。
                  </span>
                </div>
              )}

              {source && source.state !== "ready" && (
                <div className="mt-4 flex shrink-0 flex-col justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-subtle sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary/90">
                      <Settings size={16} />
                    </span>
                    <div>
                      <p className="text-[0.95rem] font-semibold text-foreground">行情连接未就绪</p>
                      <p className="mt-1 text-[0.85rem] leading-relaxed text-muted-foreground">
                        {source.message ?? "请检查当前启用的数据源"}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="!text-[12px]">
                    <Link to="/settings">前往系统设置</Link>
                  </Button>
                </div>
              )}

              <div className="mt-[10px] flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-raised">
                <div className="flex shrink-0 flex-col gap-2 bg-transparent px-5 pt-0 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as HoldingStatus)}>
                    <TabsList className="h-auto gap-7 rounded-none border-0 bg-transparent p-0 shadow-none">
                      <TabsTrigger
                        value="open"
                        className="relative h-12 gap-2 rounded-none !border-0 bg-transparent px-0 text-[0.95rem] text-muted-foreground/60 !shadow-none !outline-none !ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:!border-0 data-[state=active]:!bg-transparent data-[state=active]:text-foreground data-[state=active]:!shadow-none data-[state=active]:!outline-none data-[state=active]:!ring-0 after:absolute after:bottom-[-1px] after:left-0 after:h-0.5 after:w-full after:scale-x-0 after:bg-primary after:transition data-[state=active]:after:scale-x-100"
                      >
                        当前持仓
                        <span className="font-mono text-[0.65rem] text-muted-foreground/60">
                          {openHoldings.data?.items.length ?? selectedPortfolio.open_holding_count}
                        </span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="closed"
                        className="relative h-12 gap-2 rounded-none !border-0 bg-transparent px-0 text-[0.95rem] text-muted-foreground/60 !shadow-none !outline-none !ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=active]:!border-0 data-[state=active]:!bg-transparent data-[state=active]:text-foreground data-[state=active]:!shadow-none data-[state=active]:!outline-none data-[state=active]:!ring-0 after:absolute after:bottom-[-1px] after:left-0 after:h-0.5 after:w-full after:scale-x-0 after:bg-primary after:transition data-[state=active]:after:scale-x-100"
                      >
                        已清仓
                        <span className="font-mono text-[0.65rem] text-muted-foreground/60">
                          {closedHoldings.data?.items.length ?? 0}
                        </span>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="mb-3 flex items-center gap-3 text-[0.7rem] tracking-[0.05em] text-muted-foreground/60">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        marketStatus === "交易中" ? "bg-market-down" : "bg-primary",
                      )}
                    />
                    {activeTab === "open" ? `市场 · ${marketStatus}` : "历史记录 · 不轮询行情"}
                    {openHoldings.data?.stale && <Badge variant="warning">最后成功行情</Badge>}
                  </div>
                </div>

                <FilterBar filters={filters} onChange={setFilters} onReset={resetHoldingList} onAdd={() => openHoldingEditor(null)} />

                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as HoldingStatus)}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <TabsContent value="open" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden !outline-none !ring-0 !ring-offset-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0">
                    {openHoldings.isError && <LoadError title="当前持仓加载失败" onRetry={() => void openHoldings.refetch()} />}
                    {!openHoldings.isError && (
                      <DataTable
                        key={`open-${currentHoldingPage}-${openItems.length}`}
                        columns={openColumns}
                        data={pagedOpenHoldings}
                        isLoading={openHoldings.isLoading}
                        getRowId={(holding) => holding.id}
                        stickyHeader
                        centered
                        rowReorder={{ enabled: canReorderOpen, onReorder: reorderOpenHoldings }}
                        className="rounded-none border-0 bg-transparent shadow-none"
                        empty={<EmptyState status="open" onAdd={() => openHoldingEditor(null)} />}
                        pagination={
                          activeTab === "open" && !openHoldings.isLoading && openItems.length > 0 ? (
                            <PortfolioPagination
                              page={currentHoldingPage}
                              totalPages={totalHoldingPages}
                              pageStart={holdingPageStart}
                              pageEnd={holdingPageEnd}
                              totalItems={activeHoldings.length}
                              onPageChange={goToHoldingPage}
                            />
                          ) : undefined
                        }
                      />
                    )}
                  </TabsContent>
                  <TabsContent value="closed" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden !outline-none !ring-0 !ring-offset-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0">
                    {closedHoldings.isError && <LoadError title="清仓历史加载失败" onRetry={() => void closedHoldings.refetch()} />}
                    {!closedHoldings.isError && (
                      <DataTable
                        key={`closed-${currentHoldingPage}-${closedItems.length}`}
                        columns={closedColumns}
                        data={pagedClosedHoldings}
                        isLoading={closedHoldings.isLoading}
                        getRowId={(holding) => holding.id}
                        stickyHeader
                        centered
                        className="rounded-none border-0 bg-transparent shadow-none"
                        empty={<EmptyState status="closed" />}
                        pagination={
                          activeTab === "closed" && !closedHoldings.isLoading && closedItems.length > 0 ? (
                            <PortfolioPagination
                              page={currentHoldingPage}
                              totalPages={totalHoldingPages}
                              pageStart={holdingPageStart}
                              pageEnd={holdingPageEnd}
                              totalItems={activeHoldings.length}
                              onPageChange={goToHoldingPage}
                            />
                          ) : undefined
                        }
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : (
            <NoPortfolioState onCreate={() => openPortfolioEditor(null)} />
          )}
        </main>
      </div>

      <Suspense fallback={null}>
        {portfolioDialogOpen && (
          <PortfolioDialog
            open={portfolioDialogOpen}
            onOpenChange={setPortfolioDialogOpen}
            portfolio={editingPortfolio}
            onCreated={(portfolio) => setSelectedPortfolioId(portfolio.id)}
          />
        )}
        {holdingDialogOpen && (
          <HoldingDialog
            open={holdingDialogOpen}
            onOpenChange={setHoldingDialogOpen}
            holding={editingHolding}
            portfolioId={selectedPortfolioId}
          />
        )}
      </Suspense>

      <AlertDialog
        open={deleteHoldingTarget !== null}
        onOpenChange={(open) => !open && setDeleteHoldingTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除“{deleteHoldingTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              该操作不可撤销，将删除这条
              {deleteHoldingTarget?.status === "closed" ? "清仓历史" : "当前持仓"}记录。
              {deleteHoldingTarget?.status === "open" && " 如需保留历史，请编辑数量为 0 并填写清仓价格和日期执行清仓。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteHoldingMutation.error && <MutationError error={deleteHoldingMutation.error} />}
          <AlertDialogFooter>
            <AlertDialogCancel className="!text-[12px]" disabled={deleteHoldingMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="!text-[12px]"
              disabled={deleteHoldingMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteHolding();
              }}
            >
              确认永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletePortfolioTarget !== null}
        onOpenChange={(open) => !open && setDeletePortfolioTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{deletePortfolioTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              组合中的当前持仓和已清仓历史都会被永久删除，且无法恢复。若只是暂时不用，建议保留这个组合。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletePortfolioMutation.error && <MutationError error={deletePortfolioMutation.error} />}
          <AlertDialogFooter>
            <AlertDialogCancel className="!text-[12px]" disabled={deletePortfolioMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="!text-[12px]"
              disabled={deletePortfolioMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDeletePortfolio();
              }}
            >
              确认删除组合
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PortfolioRail({
  portfolios,
  selectedId,
  isLoading,
  isReordering,
  onSelect,
  onCreate,
  onMove,
}: {
  portfolios: Portfolio[];
  selectedId?: string;
  isLoading: boolean;
  isReordering: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onMove: (portfolio: Portfolio, direction: -1 | 1) => void;
}) {
  const summaryQueries = usePortfolioSummariesQuery(portfolios.map((portfolio) => portfolio.id));

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-raised xl:sticky xl:top-[92px]">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl tracking-tight text-foreground">我的组合</h2>
          </div>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg border border-primary/30 bg-primary/[0.08] text-primary transition-colors hover:border-primary/55 hover:bg-primary/[0.15]"
            onClick={onCreate}
            aria-label="新建投资组合"
            title="新建投资组合"
          >
            <Plus size={17} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading &&
          [0, 1, 2].map((item) => <div key={item} className="h-[130px] animate-pulse rounded-xl bg-secondary" />)}
        {!isLoading && portfolios.map((portfolio, index) => {
          return (
            <PortfolioRailItem
              key={portfolio.id}
              portfolio={portfolio}
              summary={summaryQueries[index] ?? { data: undefined, isLoading: true }}
              selected={portfolio.id === selectedId}
              index={index}
              total={portfolios.length}
              isReordering={isReordering}
              onSelect={onSelect}
              onMove={onMove}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
        <span className="text-[12px] text-muted-foreground/70">当前持仓市值</span>
        <PortfolioRailTotal summaries={summaryQueries} />
      </div>
    </aside>
  );
}

function PortfolioRailItem({
  portfolio,
  summary,
  selected,
  index,
  total,
  isReordering,
  onSelect,
  onMove,
}: {
  portfolio: Portfolio;
  summary: { data?: HoldingSummary; isLoading: boolean };
  selected: boolean;
  index: number;
  total: number;
  isReordering: boolean;
  onSelect: (id: string) => void;
  onMove: (portfolio: Portfolio, direction: -1 | 1) => void;
}) {
  const gain = summary.data?.floating_gain ?? null;
  const gainPercent = summary.data?.floating_gain_percent ?? null;
  const marketValue = summary.data?.total_market_value ?? null;

  return (
    <div
      className={cn(
        "group relative flex items-stretch gap-1 rounded-xl border transition-all duration-200",
        selected
          ? "border-primary/45 bg-primary/[0.10] shadow-[inset_3px_0_0_var(--primary)]"
          : "border-border/45 bg-card-deep/10 hover:border-border hover:bg-secondary/50",
      )}
    >
      <button
        type="button"
        className="min-w-0 flex-1 px-4 py-4 text-left"
        onClick={() => onSelect(portfolio.id)}
        aria-current={selected ? "page" : undefined}
      >
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[1rem] font-semibold tracking-tight text-foreground" title={portfolio.name}>
            {portfolio.name}
          </span>
          <span className={cn("shrink-0 font-mono text-[13px] font-medium", movementClass(gain))}>
            {summary.isLoading || !summary.data ? "—" : formatRailSignedMoney(gain)}
          </span>
        </span>
        <span className="mt-4 flex items-baseline justify-between gap-3">
          <span className="font-mono text-[16px] font-semibold tracking-[-0.04em] text-foreground">
            {summary.isLoading ? "—" : formatRailMoney(marketValue)}
          </span>
          <span className={cn("font-mono text-[13px] font-medium", movementClass(gainPercent))}>
            {summary.isLoading || !summary.data ? "—" : formatPercent(gainPercent)}
          </span>
        </span>
      </button>

      <div className="flex flex-col justify-center pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          className="grid size-5 place-items-center rounded text-muted-foreground/60 hover:bg-secondary hover:text-foreground disabled:opacity-20"
          onClick={() => void onMove(portfolio, -1)}
          disabled={isReordering || index === 0}
          aria-label={`将${portfolio.name}上移`}
          title="上移"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          className="grid size-5 place-items-center rounded text-muted-foreground/60 hover:bg-secondary hover:text-foreground disabled:opacity-20"
          onClick={() => void onMove(portfolio, 1)}
          disabled={isReordering || index === total - 1}
          aria-label={`将${portfolio.name}下移`}
          title="下移"
        >
          <ArrowDown size={12} />
        </button>
      </div>
    </div>
  );
}

function PortfolioRailTotal({ summaries }: { summaries: Array<{ data?: HoldingSummary; isLoading: boolean }> }) {
  const total = summaries.reduce((sum, summary) => sum + (summary.data?.total_market_value ?? 0), 0);
  const isLoading = summaries.some((summary) => summary.isLoading);
  const hasValue = summaries.some((summary) => summary.data?.total_market_value !== null && summary.data?.total_market_value !== undefined);

  return (
    <span className="font-mono text-[0.9rem] font-semibold tracking-tight text-foreground">
      {hasValue ? formatRailMoney(total) : isLoading ? "—" : "暂无数据"}
    </span>
  );
}

function PortfolioHeader({
  portfolio,
  marketStatus,
  summary,
  isSummaryLoading,
  onRefresh,
  isRefreshing,
  onEdit,
  onDelete,
  onSetDefault,
  isSettingDefault,
  error,
}: {
  portfolio: Portfolio;
  marketStatus: string;
  summary?: HoldingSummary;
  isSummaryLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  isSettingDefault: boolean;
  error: Error | null;
}) {
  return (
    <section className="relative shrink-0 overflow-hidden rounded-2xl border border-border bg-card px-6 py-6 shadow-raised sm:px-7">
      <div className="pointer-events-none absolute -right-8 -top-16 size-48 rounded-full border border-primary/10" />
      <div className="pointer-events-none absolute -right-2 -top-10 size-32 rounded-full border border-primary/10" />
      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-subtle">
              <Layers3 size={19} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-2xl tracking-tight text-foreground">{portfolio.name}</h2>
                {portfolio.is_default && <Badge variant="neutral" className="border-primary/25 bg-primary/10 text-primary"><Star size={11} className="fill-current" /> 默认组合</Badge>}
              </div>
              <p className="mt-1 flex items-center gap-2 text-[0.72rem] tracking-[0.08em] text-muted-foreground/65">
                <span className="size-1.5 rounded-full bg-primary" />
                {marketStatus === "交易中" ? "LIVE QUOTES" : "MARKET CLOSED"} · {marketStatus}
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-[0.88rem] leading-7 text-muted-foreground">
            {portfolio.note || "这个组合还没有备注。可以记录策略、账户用途或观察重点。"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="!text-[12px]" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn(isRefreshing && "animate-spin")} size={14} /> 刷新行情
          </Button>
          {!portfolio.is_default && (
            <Button variant="outline" size="sm" className="!text-[12px]" onClick={onSetDefault} disabled={isSettingDefault}>
              <Star size={14} /> 设为默认
            </Button>
          )}
          <Button variant="outline" size="sm" className="!text-[12px]" onClick={onEdit}>
            <Edit3 size={14} /> 编辑
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="!text-[12px] border-danger/40 text-danger hover:border-danger/65 hover:bg-danger/10 hover:text-danger"
            onClick={onDelete}
          >
            <Trash2 size={14} /> 删除
          </Button>
        </div>
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-x-5 gap-y-5 border-t border-border pt-5 sm:grid-cols-6">
        <InlineSummaryMetric
          label="当前持仓"
          value={summary ? `${summary.holding_count} 只` : "—"}
          icon={Layers3}
          iconClass="text-sky-300"
          isLoading={isSummaryLoading}
        />
        <InlineSummaryMetric
          label="当前持仓市值"
          value={summary ? formatMoney(summary.total_market_value) : "—"}
          icon={CircleDollarSign}
          iconClass="text-emerald-300"
          isLoading={isSummaryLoading}
        />
        <InlineSummaryMetric
          label="浮动盈亏"
          value={summary ? formatMoney(summary.floating_gain) : "—"}
          icon={summary && (summary.floating_gain ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.floating_gain ?? null)}
          valueClass={movementClass(summary?.floating_gain ?? null)}
          isLoading={isSummaryLoading}
        />
        <InlineSummaryMetric
          label="浮动盈亏率"
          value={summary ? formatPercent(summary.floating_gain_percent) : "—"}
          icon={summary && (summary.floating_gain_percent ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.floating_gain_percent ?? null)}
          valueClass={movementClass(summary?.floating_gain_percent ?? null)}
          isLoading={isSummaryLoading}
        />
        <InlineSummaryMetric
          label={summary?.realized_incomplete ? "已实现盈亏（待补录）" : "已实现盈亏"}
          value={summary ? formatMoney(summary.realized_gain) : "—"}
          icon={summary && (summary.realized_gain ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.realized_gain ?? null)}
          valueClass={movementClass(summary?.realized_gain ?? null)}
          isLoading={isSummaryLoading}
        />
        <InlineSummaryMetric
          label="累计总盈亏"
          value={summary ? formatMoney(summary.total_gain) : "—"}
          icon={summary && (summary.total_gain ?? 0) < 0 ? ArrowDownRight : ArrowUpRight}
          iconClass={movementClass(summary?.total_gain ?? null)}
          valueClass={movementClass(summary?.total_gain ?? null)}
          isLoading={isSummaryLoading}
        />
      </div>
      {error && <MutationError error={error} className="relative mt-4" />}
    </section>
  );
}

function InlineSummaryMetric({
  label,
  value,
  icon: Icon,
  iconClass,
  valueClass,
  isLoading,
}: {
  label: string;
  value: string;
  icon: typeof Layers3;
  iconClass: string;
  valueClass?: string;
  isLoading: boolean;
}) {
  return (
    <div className="min-w-0 border-border sm:border-l sm:pl-5 first:border-l-0 first:pl-0">
      <div className="flex items-center gap-2">
        <Icon className={cn("size-3.5", iconClass)} />
        <p className="truncate text-[12.5px] font-medium tracking-wide text-muted-foreground/70">{label}</p>
      </div>
      {isLoading ? (
        <div className="mt-2 h-6 w-2/3 animate-pulse rounded-full bg-secondary" />
      ) : (
        <p className={cn("mt-1.5 font-mono text-[1.12rem] font-semibold tracking-tight", valueClass ?? "text-foreground")}>
          {value}
        </p>
      )}
    </div>
  );
}

function FilterBar({
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
            <label className="mb-1 flex items-center gap-1.5 text-[0.76rem] font-medium text-muted-foreground">
              <Search size={12} /> 代码 / 名称
            </label>
            <Input placeholder="输入代码或名称" value={filters.keyword} onChange={(event) => update({ keyword: event.target.value })} className="h-9" />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[0.76rem] font-medium text-muted-foreground">
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
            <label className="mb-1 flex items-center gap-1.5 text-[0.76rem] font-medium text-muted-foreground">
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
          <Button type="button" variant="outline" size="sm" onClick={onReset} className="h-9 px-3 !text-[12px] text-muted-foreground">
            重置
          </Button>
          <Button type="button" size="sm" className="h-9 px-3.5 !text-[12px]" onClick={onAdd}>
            新增
          </Button>
        </div>
      </div>
    </div>
  );
}

function createOpenColumns(
  onEdit: (holding: Holding) => void,
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
      meta: {
        headerClassName: "!sticky !left-0 !z-30 min-w-[176px] !bg-secondary",
        cellClassName: "!sticky !left-0 !z-10 min-w-[176px] !bg-card group-hover:!bg-secondary",
      },
    },
    { accessorKey: "asset_type", header: "类型", cell: ({ row }) => <Badge className="!text-[13px]">{row.original.asset_type === "a_share" ? "A 股" : "ETF"}</Badge> },
    numericColumn("average_cost", "平均成本", (holding) => formatPoint(holding.average_cost, { group: false })),
    numericColumn("quantity", "数量", (holding) => holding.quantity.toLocaleString("zh-CN", { useGrouping: false })),
    numericColumn("cost_amount", "成本金额", (holding) => formatMoney(holding.cost_amount)),
    numericColumn("latest", "最新价", (holding) => formatPoint(holding.latest, { group: false })),
    sortableColumn("market_value", "当前市值", "market_value", sort, onSort, (holding) => formatMoney(holding.market_value), "center"),
    sortableColumn("floating_gain", "浮动盈亏", "floating_gain", sort, onSort, (holding) => <span className={movementClass(holding.floating_gain)}>{formatMoney(holding.floating_gain)}</span>, "center"),
    sortableColumn("floating_gain_percent", "盈亏率", "floating_gain_percent", sort, onSort, (holding) => <span className={movementClass(holding.floating_gain_percent)}>{formatPercent(holding.floating_gain_percent)}</span>, "center"),
    numericColumn("change_percent", "今日涨跌", (holding) => <span className={movementClass(holding.change_percent)}>{formatPercent(holding.change_percent)}</span>),
    sortableColumn("weight_percent", "组合占比", "weight_percent", sort, onSort, (holding) => formatPercentUnsigned(holding.weight_percent), "center"),
    sortableColumn("opened_on", "建仓日期", "opened_on", sort, onSort, (holding) => formatDate(holding.opened_on)),
    {
      accessorKey: "note",
      header: "备注",
      cell: ({ row }) => <span className="block max-w-44 truncate" title={row.original.note ?? ""}>{row.original.note || "—"}</span>,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <RowActions holding={row.original} onEdit={onEdit} onDelete={onDelete} />,
      meta: { align: "center", headerClassName: "!sticky !right-0 !z-30 !bg-secondary", cellClassName: "!sticky !right-0 !z-10 w-[96px] !bg-card group-hover:!bg-secondary" },
    },
  ];
}

function createClosedColumns(
  onEdit: (holding: Holding) => void,
  onDelete: (holding: Holding) => void,
  sort: HoldingSortState,
  onSort: (key: HoldingSortKey) => void,
): ColumnDef<Holding, unknown>[] {
  return [
    {
      id: "instrument",
      header: "标的名称",
      cell: ({ row }) => <InstrumentCell holding={row.original} />,
      meta: { headerClassName: "!sticky !left-0 !z-30 min-w-[176px] !bg-secondary", cellClassName: "!sticky !left-0 !z-10 min-w-[176px] !bg-card group-hover:!bg-secondary" },
    },
    { accessorKey: "asset_type", header: "类型", cell: ({ row }) => <Badge className="!text-[13px]">{row.original.asset_type === "a_share" ? "A 股" : "ETF"}</Badge> },
    numericColumn("average_cost", "原平均成本", (holding) => formatPoint(holding.average_cost, { group: false })),
    numericColumn("closed_quantity", "清仓数量", (holding) => holding.closed_quantity?.toLocaleString("zh-CN", { useGrouping: false }) ?? "暂无数据"),
    numericColumn("close_price", "清仓价格", (holding) => formatPoint(holding.close_price, { group: false })),
    numericColumn("close_amount", "清仓金额", (holding) => formatMoney(holding.close_amount)),
    numericColumn("realized_gain", "已实现盈亏", (holding) => <span className={movementClass(holding.realized_gain)}>{formatMoney(holding.realized_gain)}</span>),
    numericColumn("realized_gain_percent", "已实现盈亏率", (holding) => <span className={movementClass(holding.realized_gain_percent)}>{formatPercent(holding.realized_gain_percent)}</span>),
    sortableColumn("opened_on", "建仓日期", "opened_on", sort, onSort, (holding) => formatDate(holding.opened_on)),
    numericColumn("closed_on", "清仓日期", (holding) => holding.closed_on ? formatDate(holding.closed_on) : formatDateTime(holding.closed_at)),
    {
      accessorKey: "note",
      header: "备注",
      cell: ({ row }) => <span className="block max-w-72 truncate" title={row.original.note ?? ""}>{row.original.note || "—"}</span>,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => <RowActions holding={row.original} onEdit={onEdit} onDelete={onDelete} />,
      meta: { align: "center", headerClassName: "!sticky !right-0 !z-30 !bg-secondary", cellClassName: "!sticky !right-0 !z-10 !bg-card group-hover:!bg-secondary" },
    },
  ];
}

function numericColumn(
  id: keyof Holding,
  header: string,
  render: (holding: Holding) => ReactNode,
): ColumnDef<Holding, unknown> {
  return { id, header, cell: ({ row }) => render(row.original), meta: { align: "center" } };
}

function sortableColumn(
  id: keyof Holding,
  label: string,
  sortKey: HoldingSortKey,
  sort: HoldingSortState,
  onSort: (key: HoldingSortKey) => void,
  render: (holding: Holding) => ReactNode,
  align?: "right" | "center",
): ColumnDef<Holding, unknown> {
  return {
    id,
    header: () => <SortHeader label={label} sortKey={sortKey} sort={sort} onSort={onSort} />,
    cell: ({ row }) => render(row.original),
    meta: { align: align ?? "center" },
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
      className="inline-flex items-center justify-center gap-1 !text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => onSort(sortKey)}
      aria-label={`按${label}${isActive && sort.direction === "desc" ? "降序" : "升序"}排序`}
    >
      {label}
      {isActive ? (
        sort.direction === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
      ) : (
        <ArrowUpDown size={13} />
      )}
    </button>
  );
}

function InstrumentCell({ holding, showDragHandle = false }: { holding: Holding; showDragHandle?: boolean }) {
  return (
    <div className="relative flex w-full items-center justify-center">
      {showDragHandle && <GripVertical className="absolute left-0 shrink-0 text-muted-foreground/45" size={14} aria-hidden="true" />}
      <div className="min-w-0 text-center">
        <p className="font-semibold text-foreground">{holding.name}</p>
        <p className="mt-1 font-mono text-[0.75rem] tracking-[0.04em] text-muted-foreground/60">{holding.thscode}</p>
      </div>
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
    <div className="flex justify-center gap-1">
      <Button variant="ghost" size="icon" className="size-9" onClick={() => onEdit(holding)} aria-label={`编辑 ${holding.name}`} title="编辑">
        <Edit3 size={15} />
      </Button>
      <Button variant="ghost" size="icon" className="size-9 text-danger hover:bg-danger/10 hover:text-danger" onClick={() => onDelete(holding)} aria-label={`删除 ${holding.name}`} title="删除">
        <Trash2 size={15} />
      </Button>
    </div>
  );
}

function PortfolioPagination({
  page,
  totalPages,
  pageStart,
  pageEnd,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-secondary/15 px-5 py-3.5">
      <p className="font-mono text-[0.7rem] tracking-[0.08em] text-muted-foreground/60">
        显示 {pageStart}-{pageEnd} / 共 {totalItems} 条 · PAGE {page.toString().padStart(2, "0")} / {totalPages.toString().padStart(2, "0")}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={14} /> 上一页
        </Button>
        <span className="min-w-20 text-center text-[0.85rem] text-muted-foreground">第 {page} 页</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          下一页 <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ status, onAdd }: { status: HoldingStatus; onAdd?: () => void }) {
  const isOpen = status === "open";
  return (
    <div className="grid min-h-64 place-items-center border-t border-border px-6 py-14 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-secondary text-muted-foreground/60">
          {isOpen ? <BriefcaseBusiness size={19} /> : <Archive size={19} />}
        </span>
        <h3 className="mt-4 font-display text-[1.4rem] tracking-tight text-foreground">{isOpen ? "组合里还没有当前持仓" : "还没有清仓历史"}</h3>
        <p className="mx-auto mt-2 max-w-md text-[0.9rem] leading-7 text-muted-foreground">
          {isOpen ? "从数据源检索 A 股或 ETF，把第一只股票放进这个组合。" : "数量调整为 0 并完成清仓确认的记录会保留在这里。"}
        </p>
        {isOpen && onAdd && <Button className="mt-6 !text-[12px]" size="sm" onClick={onAdd}><Plus size={14} /> 添加第一只股票</Button>}
      </div>
    </div>
  );
}

function NoPortfolioState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid min-h-[560px] place-items-center rounded-2xl border border-dashed border-primary/30 bg-card px-6 py-16 text-center shadow-raised">
      <div>
        <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
          <Orbit size={26} />
        </span>
        <p className="mt-6 font-mono text-[0.65rem] tracking-[0.18em] text-primary/75">PORTFOLIO DESK / EMPTY</p>
        <h2 className="mt-3 font-display text-3xl tracking-tight text-foreground">建立你的第一个组合</h2>
        <p className="mx-auto mt-3 max-w-md text-[0.92rem] leading-7 text-muted-foreground">
          用不同组合隔离策略和观察视角，组合内股票的市值与盈亏会自动聚合。
        </p>
        <Button className="mt-7 !text-[12px]" onClick={onCreate}><Plus size={16} /> 新建投资组合</Button>
      </div>
    </div>
  );
}

function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-border bg-card text-center shadow-raised">
      <div>
        <AlertTriangle className="mx-auto text-market-up" size={24} />
        <h3 className="mt-4 font-display text-[1.4rem] tracking-tight text-foreground">{title}</h3>
        <Button className="mt-5 !text-[12px]" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>
      </div>
    </div>
  );
}

function MutationError({ error, className }: { error: Error | null; className?: string }) {
  if (!error) return null;
  const message = error instanceof ApiError ? error.message : "操作失败，请稍后重试";
  return <div role="alert" className={cn("border-l-2 border-market-up bg-danger/10 px-4 py-3 text-sm text-market-up", className)}>{message}</div>;
}

function reconcileOrderIds(orderIds: string[], itemIds: string[]): string[] {
  const itemIdSet = new Set(itemIds);
  const retained = orderIds.filter((id) => itemIdSet.has(id));
  const retainedSet = new Set(retained);
  return [...retained, ...itemIds.filter((id) => !retainedSet.has(id))];
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function applyHoldingOrder(items: Holding[], orderIds: string[]): Holding[] {
  if (orderIds.length === 0) return items;
  const orderMap = new Map(orderIds.map((id, index) => [id, index]));
  return [...items].sort(
    (left, right) =>
      (orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function sortHoldings(items: Holding[], sort: HoldingSortState): Holding[] {
  if (!sort) return items;
  return [...items].sort((left, right) => {
    const leftValue = getHoldingSortValue(left, sort.key);
    const rightValue = getHoldingSortValue(right, sort.key);
    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;

    const comparison =
      typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue)
        : Number(leftValue) - Number(rightValue);
    return sort.direction === "asc" ? comparison : -comparison;
  });
}

function getHoldingSortValue(holding: Holding, key: HoldingSortKey): number | string | null {
  switch (key) {
    case "market_value":
      return holding.market_value;
    case "floating_gain":
      return holding.floating_gain;
    case "floating_gain_percent":
      return holding.floating_gain_percent;
    case "weight_percent":
      return holding.weight_percent;
    case "opened_on":
      return holding.opened_on;
  }
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return "暂无数据";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replaceAll("/", "-");
}

function formatPercentUnsigned(value: number | null): string {
  return value === null ? "暂无数据" : `${value.toFixed(2)}%`;
}

function formatRailMoney(value: number | null): string {
  if (value === null) return "—";
  return `¥${Math.round(value).toLocaleString("zh-CN", { useGrouping: false })}`;
}

function formatRailSignedMoney(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}¥${Math.round(Math.abs(value)).toLocaleString("zh-CN", { useGrouping: false })}`;
}
