import { useEffect, useMemo, useState } from "react";

import {
  useDeleteHoldingMutation,
  useDeletePortfolioMutation,
  usePortfolioHoldingsQuery,
  usePortfolioSummaryQuery,
  usePortfoliosQuery,
  useReorderPortfolioHoldingsMutation,
  useReorderPortfoliosMutation,
  useSetDefaultPortfolioMutation,
} from "../holdings/queries";
import type { Holding, Portfolio } from "../holdings/types";
import { applyHoldingOrder, reconcileOrderIds, sortHoldings } from "./portfolio-list-logic";
import { HOLDINGS_PAGE_SIZE, usePortfoliosUrlController } from "./use-portfolios-url";

export { applyHoldingOrder, reconcileOrderIds, sortHoldings } from "./portfolio-list-logic";
export type { HoldingSortKey, HoldingSortState } from "./use-portfolios-url";

export function usePortfoliosController() {
  const {
    selectedPortfolioId,
    activeTab,
    filters,
    holdingSort,
    holdingPage,
    updateUrl,
    setSelectedPortfolioId,
    setActiveTab,
    setFilters,
    toggleHoldingSort,
    resetHoldingList: resetHoldingListUrl,
    goToHoldingPage: goToHoldingPageUrl,
  } = usePortfoliosUrlController();
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [deletePortfolioTarget, setDeletePortfolioTarget] = useState<Portfolio | null>(null);
  const [holdingDialogOpen, setHoldingDialogOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [deleteHoldingTarget, setDeleteHoldingTarget] = useState<Holding | null>(null);
  const [openOrderIdsByPortfolio, setOpenOrderIdsByPortfolio] = useState<Record<string, string[]>>({});

  const portfoliosQuery = usePortfoliosQuery();
  const portfolios = useMemo(() => portfoliosQuery.data?.items ?? [], [portfoliosQuery.data?.items]);
  const selectedPortfolio = portfolios.find((portfolio) => portfolio.id === selectedPortfolioId) ?? null;
  const openHoldings = usePortfolioHoldingsQuery(selectedPortfolioId, "open", filters, activeTab === "open");
  const closedHoldings = usePortfolioHoldingsQuery(selectedPortfolioId, "closed", filters, activeTab === "closed");
  const summary = usePortfolioSummaryQuery(selectedPortfolioId);
  const deleteHoldingMutation = useDeleteHoldingMutation(selectedPortfolioId);
  const deletePortfolioMutation = useDeletePortfolioMutation();
  const setDefaultMutation = useSetDefaultPortfolioMutation();
  const reorderHoldingsMutation = useReorderPortfolioHoldingsMutation(selectedPortfolioId);
  const reorderMutation = useReorderPortfoliosMutation();

  useEffect(() => {
    if (portfoliosQuery.isPending) return;
    if (portfolios.length === 0) {
      setSelectedPortfolioId(undefined);
      return;
    }
    if (selectedPortfolioId && portfolios.some((portfolio) => portfolio.id === selectedPortfolioId)) {
      return;
    }
    const fallback = portfolios.find((portfolio) => portfolio.is_default) ?? portfolios[0];
    if (fallback) setSelectedPortfolioId(fallback.id);
  }, [portfolios, portfoliosQuery.isPending, selectedPortfolioId, setSelectedPortfolioId]);

  const openItems = useMemo(() => openHoldings.data?.items ?? [], [openHoldings.data]);
  const closedItems = useMemo(() => closedHoldings.data?.items ?? [], [closedHoldings.data]);
  const hasHoldingFilters = Boolean(filters.keyword.trim() || filters.asset_type || filters.opened_from || filters.opened_to);
  const canReorderOpen =
    activeTab === "open" && !hasHoldingFilters && holdingSort === null && openItems.length > 1 && !reorderHoldingsMutation.isPending;

  const openOrderIds = useMemo(
    () => (selectedPortfolioId ? (openOrderIdsByPortfolio[selectedPortfolioId] ?? []) : []),
    [openOrderIdsByPortfolio, selectedPortfolioId],
  );
  const reconciledOpenOrderIds = useMemo(
    () =>
      reconcileOrderIds(
        openOrderIds,
        openItems.map((holding) => holding.id),
      ),
    [openItems, openOrderIds],
  );

  const orderedOpenHoldings = useMemo(() => applyHoldingOrder(openItems, reconciledOpenOrderIds), [openItems, reconciledOpenOrderIds]);
  const sortedOpenHoldings = useMemo(() => sortHoldings(orderedOpenHoldings, holdingSort), [holdingSort, orderedOpenHoldings]);
  const sortedClosedHoldings = useMemo(() => sortHoldings(closedItems, holdingSort), [closedItems, holdingSort]);
  const activeHoldings = activeTab === "open" ? sortedOpenHoldings : sortedClosedHoldings;
  const totalHoldingPages = Math.max(1, Math.ceil(activeHoldings.length / HOLDINGS_PAGE_SIZE));
  const currentHoldingPage = Math.min(holdingPage, totalHoldingPages);
  const holdingPageOffset = (currentHoldingPage - 1) * HOLDINGS_PAGE_SIZE;
  const pagedOpenHoldings = sortedOpenHoldings.slice(holdingPageOffset, holdingPageOffset + HOLDINGS_PAGE_SIZE);
  const pagedClosedHoldings = sortedClosedHoldings.slice(holdingPageOffset, holdingPageOffset + HOLDINGS_PAGE_SIZE);
  const holdingPageStart = activeHoldings.length === 0 ? 0 : holdingPageOffset + 1;
  const holdingPageEnd = Math.min(holdingPageOffset + HOLDINGS_PAGE_SIZE, activeHoldings.length);

  useEffect(() => {
    if (holdingPage <= totalHoldingPages) return;
    updateUrl((next) => {
      if (totalHoldingPages === 1) next.delete("page");
      else next.set("page", String(totalHoldingPages));
    });
  }, [holdingPage, totalHoldingPages, updateUrl]);

  function resetHoldingList() {
    resetHoldingListUrl();
    if (selectedPortfolioId) {
      setOpenOrderIdsByPortfolio((current) => ({ ...current, [selectedPortfolioId]: [] }));
    }
  }

  function goToHoldingPage(nextPage: number) {
    goToHoldingPageUrl(nextPage, totalHoldingPages);
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
      reconciledOpenOrderIds,
      openItems.map((holding) => holding.id),
    );
    const activeIndex = currentOrder.indexOf(activeId);
    const overIndex = currentOrder.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return;

    const nextOrder = [...currentOrder];
    const [movedId] = nextOrder.splice(activeIndex, 1);
    if (!movedId) return;
    nextOrder.splice(overIndex, 0, movedId);
    if (selectedPortfolioId) {
      setOpenOrderIdsByPortfolio((current) => ({ ...current, [selectedPortfolioId]: nextOrder }));
    }

    try {
      await reorderHoldingsMutation.mutateAsync(nextOrder);
    } catch {
      if (selectedPortfolioId) {
        setOpenOrderIdsByPortfolio((current) => ({ ...current, [selectedPortfolioId]: currentOrder }));
      }
    }
  };

  const source = openHoldings.data?.data_source ?? summary.data?.data_source;
  const marketStatus = openHoldings.data?.market_status ?? summary.data?.market_status ?? "未知";
  const isRefreshing = portfoliosQuery.isFetching || openHoldings.isFetching || closedHoldings.isFetching || summary.isFetching;

  return {
    portfoliosQuery,
    portfolios,
    selectedPortfolioId,
    selectedPortfolio,
    setSelectedPortfolioId,
    portfolioDialogOpen,
    setPortfolioDialogOpen,
    editingPortfolio,
    setEditingPortfolio,
    deletePortfolioTarget,
    setDeletePortfolioTarget,
    activeTab,
    setActiveTab,
    holdingDialogOpen,
    setHoldingDialogOpen,
    editingHolding,
    setEditingHolding,
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
    sortedOpenHoldings,
    sortedClosedHoldings,
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
  };
}
