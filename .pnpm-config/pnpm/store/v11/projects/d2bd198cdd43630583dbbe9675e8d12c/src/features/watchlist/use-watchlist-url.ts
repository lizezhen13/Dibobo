import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { WatchlistFilters } from "./types";

export const DEFAULT_FILTERS: WatchlistFilters = { keyword: "", asset_type: "" };

export type SortKey = "custom" | "latest" | "change" | "change_percent" | "volume" | "turnover" | "added_at";

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { key: "custom", direction: "asc" };
export const WATCHLIST_PAGE_SIZE = 10;

export function useWatchlistUrlController() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const urlState = useMemo(() => parseWatchlistUrlState(searchParamsString), [searchParamsString]);

  const updateUrl = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParamsString);
      mutate(next);
      setSearchParams(next, { replace: true });
    },
    [searchParamsString, setSearchParams],
  );

  const updateFilter = useCallback(
    <K extends keyof WatchlistFilters>(key: K, value: WatchlistFilters[K]) => {
      updateUrl((next) => {
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
      });
    },
    [updateUrl],
  );

  const requestSort = useCallback(
    (key: SortKey) => {
      updateUrl((next) => {
        const direction = urlState.sort.key !== key ? "desc" : urlState.sort.direction === "asc" ? "desc" : "asc";
        next.set("sort", key);
        next.set("direction", direction);
        next.delete("page");
      });
    },
    [updateUrl, urlState.sort],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const goToPage = useCallback(
    (nextPage: number, totalPages: number) => {
      const boundedPage = Math.max(1, Math.min(nextPage, totalPages));
      updateUrl((next) => {
        if (boundedPage === 1) next.delete("page");
        else next.set("page", String(boundedPage));
      });
    },
    [updateUrl],
  );

  return {
    ...urlState,
    updateUrl,
    updateFilter,
    requestSort,
    clearFilters,
    goToPage,
  };
}

export function parseWatchlistUrlState(searchParamsString: string): {
  filters: WatchlistFilters;
  sort: SortState;
  page: number;
} {
  const params = new URLSearchParams(searchParamsString);
  const assetType = params.get("asset_type");
  const sortKey = params.get("sort");
  const direction = params.get("direction");
  const parsedPage = Number(params.get("page"));

  return {
    filters: {
      keyword: params.get("keyword") ?? "",
      asset_type: assetType === "a_share" || assetType === "fund_etf" ? assetType : "",
    },
    sort: {
      key: isSortKey(sortKey) ? sortKey : DEFAULT_SORT.key,
      direction: direction === "desc" ? "desc" : "asc",
    },
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  };
}

function isSortKey(value: string | null): value is SortKey {
  return (
    value === "custom" ||
    value === "latest" ||
    value === "change" ||
    value === "change_percent" ||
    value === "volume" ||
    value === "turnover" ||
    value === "added_at"
  );
}
