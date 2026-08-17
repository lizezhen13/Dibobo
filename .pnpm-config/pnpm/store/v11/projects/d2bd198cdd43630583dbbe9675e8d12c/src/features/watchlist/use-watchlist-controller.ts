import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../../lib/api";
import { useBatchDeleteWatchlistMutation, useDeleteWatchlistMutation, useReorderWatchlistMutation, useWatchlistQuery } from "./queries";
import { sortWatchlistItems } from "./watchlist-list-logic";
import { WATCHLIST_PAGE_SIZE, useWatchlistUrlController } from "./use-watchlist-url";
import type { WatchlistItem } from "./types";

export { compareValues, sortWatchlistItems } from "./watchlist-list-logic";
export { DEFAULT_FILTERS, DEFAULT_SORT, WATCHLIST_PAGE_SIZE, parseWatchlistUrlState } from "./use-watchlist-url";
export type { SortDirection, SortKey, SortState } from "./use-watchlist-url";
const EMPTY_SELECTED_IDS = new Set<string>();

export function useWatchlistController() {
  const { filters, sort, page, updateFilter, requestSort, clearFilters, goToPage: goToPageUrl } = useWatchlistUrlController();
  const [selectionState, setSelectionState] = useState<{ key: string; ids: Set<string> }>({
    key: "",
    ids: EMPTY_SELECTED_IDS,
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [noteDialogItem, setNoteDialogItem] = useState<WatchlistItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WatchlistItem | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const query = useWatchlistQuery(filters);
  const deleteMutation = useDeleteWatchlistMutation();
  const batchDeleteMutation = useBatchDeleteWatchlistMutation();
  const reorderMutation = useReorderWatchlistMutation();

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const activeFilterCount = (filters.keyword.trim() ? 1 : 0) + (filters.asset_type ? 1 : 0);
  const isFiltered = Boolean(filters.keyword.trim() || filters.asset_type);
  const canDrag = !isFiltered && sort.key === "custom" && !reorderMutation.isPending;
  const selectionKey = `${filters.asset_type}\u0000${filters.keyword}`;
  const selectedIds = selectionState.key === selectionKey ? selectionState.ids : EMPTY_SELECTED_IDS;

  const updateSelectedIds = (update: (current: Set<string>) => Set<string>) => {
    setSelectionState((current) => ({
      key: selectionKey,
      ids: update(current.key === selectionKey ? current.ids : EMPTY_SELECTED_IDS),
    }));
  };

  const displayItems = useMemo(() => sortWatchlistItems(items, sort), [items, sort]);

  const totalPages = Math.max(1, Math.ceil(displayItems.length / WATCHLIST_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * WATCHLIST_PAGE_SIZE;
    return displayItems.slice(start, start + WATCHLIST_PAGE_SIZE);
  }, [currentPage, displayItems]);
  const pageStart = displayItems.length === 0 ? 0 : (currentPage - 1) * WATCHLIST_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * WATCHLIST_PAGE_SIZE, displayItems.length);

  const allVisibleSelected = pageItems.length > 0 && pageItems.every((item) => selectedIds.has(item.id));
  const someVisibleSelected = pageItems.some((item) => selectedIds.has(item.id));
  const selectedVisibleCount = displayItems.filter((item) => selectedIds.has(item.id)).length;
  const latestQuoteTime = useMemo(() => {
    const timestamps = items.map((item) => item.quoted_at).filter((value): value is string => Boolean(value));
    if (timestamps.length === 0) return null;
    return timestamps.reduce((latest, current) => (new Date(current).getTime() > new Date(latest).getTime() ? current : latest));
  }, [items]);

  useEffect(() => {
    if (page <= totalPages) return;
    goToPageUrl(totalPages, totalPages);
  }, [goToPageUrl, page, totalPages]);

  function toggleSelected(id: string) {
    updateSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    updateSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        pageItems.forEach((item) => next.delete(item.id));
      } else {
        pageItems.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }

  function goToPage(nextPage: number) {
    goToPageUrl(nextPage, totalPages);
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
      setSelectionState({ key: selectionKey, ids: EMPTY_SELECTED_IDS });
      setBatchDeleteOpen(false);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    }
  }

  const mutationError = deleteMutation.error ?? batchDeleteMutation.error ?? reorderMutation.error;
  const mutationErrorMessage = mutationError instanceof ApiError ? mutationError.message : mutationError ? "操作失败，请稍后重试" : null;

  return {
    filters,
    sort,
    page,
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
    reorderMutation,
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
    confirmDelete,
    confirmBatchDelete,
    source: query.data?.data_source,
    marketStatus: query.data?.market_status ?? "未知",
    mutationErrorMessage,
  };
}
