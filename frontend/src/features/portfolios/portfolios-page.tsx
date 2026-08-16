import { AlertTriangle, Orbit, Plus, Settings } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";

import { ErrorState, InlineAlert, PageContainer } from "../../components/patterns";
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
import { ApiError } from "../../lib/api";
import { usePortfoliosController } from "./use-portfolios-controller";
import { PortfolioHeader } from "./portfolio-header";
import { PortfolioHoldingsWorkspace } from "./portfolio-holdings-workspace";
import { PortfolioRail } from "./portfolio-rail";

const HoldingDialog = lazy(() => import("../holdings/holding-dialog").then(({ HoldingDialog: Dialog }) => ({ default: Dialog })));
const PortfolioDialog = lazy(() => import("./portfolio-dialog").then(({ PortfolioDialog: Dialog }) => ({ default: Dialog })));

export function PortfoliosPage() {
  const {
    portfoliosQuery,
    portfolios,
    selectedPortfolioId,
    selectedPortfolio,
    setSelectedPortfolioId,
    portfolioDialogOpen,
    setPortfolioDialogOpen,
    editingPortfolio,
    deletePortfolioTarget,
    setDeletePortfolioTarget,
    activeTab,
    setActiveTab,
    holdingDialogOpen,
    setHoldingDialogOpen,
    editingHolding,
    deleteHoldingTarget,
    setDeleteHoldingTarget,
    filters,
    setFilters,
    holdingSort,
    openHoldings,
    closedHoldings,
    summary,
    deleteHoldingMutation,
    deletePortfolioMutation,
    setDefaultMutation,
    reorderMutation,
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
    toggleHoldingSort,
    resetHoldingList,
    goToHoldingPage,
    openPortfolioEditor,
    openHoldingEditor,
    refresh,
    confirmDeleteHolding,
    confirmDeletePortfolio,
    setDefault,
    movePortfolio,
    reorderOpenHoldings,
    source,
    marketStatus,
    isRefreshing,
  } = usePortfoliosController();

  return (
    <PageContainer size="fluid" className="portfolio-page flex min-h-0 flex-col">
      <h1 className="sr-only">投资组合</h1>
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
            <ErrorState
              title="投资组合加载失败"
              description="请检查本地服务状态后重试。"
              retryLabel="重新加载"
              onRetry={() => void portfoliosQuery.refetch()}
              className="min-h-64"
            />
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
                  <span className="leading-relaxed">部分持仓行情缺失，组合汇总不完整；缺失值没有按 0 计算。</span>
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

              <PortfolioHoldingsWorkspace
                selectedPortfolio={selectedPortfolio}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                filters={filters}
                setFilters={setFilters}
                resetHoldingList={resetHoldingList}
                openHoldings={openHoldings}
                closedHoldings={closedHoldings}
                openItems={openItems}
                closedItems={closedItems}
                activeHoldings={activeHoldings}
                canReorderOpen={canReorderOpen}
                pagedOpenHoldings={pagedOpenHoldings}
                pagedClosedHoldings={pagedClosedHoldings}
                totalHoldingPages={totalHoldingPages}
                currentHoldingPage={currentHoldingPage}
                holdingPageStart={holdingPageStart}
                holdingPageEnd={holdingPageEnd}
                holdingSort={holdingSort}
                toggleHoldingSort={toggleHoldingSort}
                goToHoldingPage={goToHoldingPage}
                openHoldingEditor={openHoldingEditor}
                setDeleteHoldingTarget={setDeleteHoldingTarget}
                reorderOpenHoldings={reorderOpenHoldings}
              />
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

      <AlertDialog open={deleteHoldingTarget !== null} onOpenChange={(open) => !open && setDeleteHoldingTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除“{deleteHoldingTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              该操作不可撤销，将删除这条
              {deleteHoldingTarget?.status === "closed" ? "清仓历史" : "当前持仓"}记录。
              {deleteHoldingTarget?.status === "open" && " 如需保留历史，请编辑数量为 0 并填写清仓价格和日期执行清仓。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteHoldingMutation.error && <InlineAlert className="mt-4">{mutationErrorMessage(deleteHoldingMutation.error)}</InlineAlert>}
          <AlertDialogFooter>
            <AlertDialogCancel className="!text-[12px]" disabled={deleteHoldingMutation.isPending}>
              取消
            </AlertDialogCancel>
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

      <AlertDialog open={deletePortfolioTarget !== null} onOpenChange={(open) => !open && setDeletePortfolioTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{deletePortfolioTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              组合中的当前持仓和已清仓历史都会被永久删除，且无法恢复。若只是暂时不用，建议保留这个组合。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletePortfolioMutation.error && (
            <InlineAlert className="mt-4">{mutationErrorMessage(deletePortfolioMutation.error)}</InlineAlert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="!text-[12px]" disabled={deletePortfolioMutation.isPending}>
              取消
            </AlertDialogCancel>
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
    </PageContainer>
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
        <Button className="mt-7 !text-[12px]" onClick={onCreate}>
          <Plus size={16} /> 新建投资组合
        </Button>
      </div>
    </div>
  );
}

function mutationErrorMessage(error: Error | null): string {
  return error instanceof ApiError ? error.message : "操作失败，请稍后重试";
}
