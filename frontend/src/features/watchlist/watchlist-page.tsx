import { AlertTriangle, Activity, Clock3, LoaderCircle, Plus, RefreshCw, Settings } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";

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
import { Button } from "../../components/ui/button";
import { InlineAlert, PageContainer, PageHeader } from "../../components/patterns";
import { formatDateTime } from "../../lib/formatters";
import { ApiError } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useWatchlistController } from "./use-watchlist-controller";
import { WatchlistFiltersPanel } from "./watchlist-filters";
import { WatchlistTable } from "./watchlist-table";
import "./watchlist.css";

const WatchlistAddDialog = lazy(() => import("./watchlist-add-dialog").then(({ WatchlistAddDialog: Dialog }) => ({ default: Dialog })));
const WatchlistNoteDialog = lazy(() => import("./watchlist-note-dialog").then(({ WatchlistNoteDialog: Dialog }) => ({ default: Dialog })));

export function WatchlistPage() {
  const navigate = useNavigate();
  const {
    filters,
    sort,
    selectedIds,
    draggedId,
    addDialogOpen,
    noteDialogItem,
    deleteTarget,
    batchDeleteOpen,
    setDraggedId,
    setAddDialogOpen,
    setNoteDialogItem,
    setDeleteTarget,
    setBatchDeleteOpen,
    query,
    deleteMutation,
    batchDeleteMutation,
    items,
    activeFilterCount,
    isFiltered,
    canDrag,
    displayItems,
    currentPage,
    pageItems,
    pageStart,
    pageEnd,
    totalPages,
    allVisibleSelected,
    someVisibleSelected,
    selectedVisibleCount,
    latestQuoteTime,
    updateFilter,
    toggleSelected,
    toggleSelectAll,
    requestSort,
    clearFilters,
    goToPage,
    dropRow,
    moveRow,
    confirmDelete,
    confirmBatchDelete,
    source,
    marketStatus,
    mutationErrorMessage,
  } = useWatchlistController();

  return (
    <PageContainer size="wide" className="watchlist-page flex min-h-0 flex-col">
      <PageHeader
        eyebrow="WATCHLIST / 自选管理"
        title="自选管理"
        description="只保留你真正想盯住的 A 股与 ETF；顺序、备注和观察习惯都属于你。"
        className="shrink-0"
        actions={
          <>
            <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={cn(query.isFetching && "animate-spin")} size={15} /> 刷新行情
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus size={17} /> 添加自选
            </Button>
          </>
        }
      />

      <section className="grid shrink-0 grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]">
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
                <span
                  className={cn("size-1.5 rounded-full", query.data?.polling_enabled ? "animate-pulse bg-market-up" : "bg-primary/70")}
                />
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

        <WatchlistFiltersPanel
          keyword={filters.keyword}
          assetType={filters.asset_type}
          activeFilterCount={activeFilterCount}
          isFiltered={isFiltered}
          displayCount={displayItems.length}
          sortKey={sort.key}
          onKeywordChange={(value) => updateFilter("keyword", value)}
          onAssetTypeChange={(value) => updateFilter("asset_type", value)}
          onClear={clearFilters}
        />
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
        <div
          className={cn(
            "mt-4 flex items-center gap-2.5 rounded-r-xl border-l-4 px-5 py-3.5 text-[0.85rem]",
            mutationErrorMessage ? "border-market-up bg-market-up/7 text-danger" : "border-warning bg-warning/8 text-warning",
          )}
        >
          {mutationErrorMessage ? <AlertTriangle size={16} /> : <AlertTriangle size={16} />}
          <span>{mutationErrorMessage ?? "当前展示的是最后一次成功行情，数据源正在重试。"}</span>
        </div>
      )}

      <WatchlistTable
        query={query}
        sort={sort}
        filterKey={`${filters.keyword}\u0000${filters.asset_type}`}
        selectedIds={selectedIds}
        draggedId={draggedId}
        canDrag={canDrag}
        pageItems={pageItems}
        displayItems={displayItems}
        isFiltered={isFiltered}
        selectedVisibleCount={selectedVisibleCount}
        currentPage={currentPage}
        totalPages={totalPages}
        pageStart={pageStart}
        pageEnd={pageEnd}
        allVisibleSelected={allVisibleSelected}
        someVisibleSelected={someVisibleSelected}
        onToggleSelectAll={toggleSelectAll}
        onToggleSelected={toggleSelected}
        onOpenBatchDelete={() => setBatchDeleteOpen(true)}
        onOpenNote={setNoteDialogItem}
        onDelete={setDeleteTarget}
        onDetails={(item) => navigate(`/watchlist/detail/${encodeURIComponent(item.ticker)}`)}
        onDragStart={setDraggedId}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => {
          if (canDrag) event.preventDefault();
        }}
        onDrop={(itemId) => void dropRow(itemId)}
        onMoveRow={(itemId, direction) => void moveRow(itemId, direction)}
        onSort={requestSort}
        onClear={clearFilters}
        onAdd={() => setAddDialogOpen(true)}
        onPageChange={goToPage}
      />

      <Suspense fallback={null}>
        {addDialogOpen && <WatchlistAddDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />}
        {noteDialogItem && (
          <WatchlistNoteDialog
            key={noteDialogItem.id}
            open
            onOpenChange={(open) => !open && setNoteDialogItem(null)}
            item={noteDialogItem}
          />
        )}
      </Suspense>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>从自选列表移除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>这只标的会从你的自选列表中永久删除，投资组合和其他数据不会受到影响。</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && (
            <InlineAlert className="mt-4">
              {deleteMutation.error instanceof ApiError ? deleteMutation.error.message : "操作失败，请稍后重试"}
            </InlineAlert>
          )}
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
            <AlertDialogDescription>这些记录会被永久删除，操作不可撤销。未选中的标的不会受到影响。</AlertDialogDescription>
          </AlertDialogHeader>
          {batchDeleteMutation.error && (
            <InlineAlert className="mt-4">
              {batchDeleteMutation.error instanceof ApiError ? batchDeleteMutation.error.message : "操作失败，请稍后重试"}
            </InlineAlert>
          )}
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
    </PageContainer>
  );
}
