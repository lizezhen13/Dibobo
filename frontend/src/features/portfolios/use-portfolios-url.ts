import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { HoldingStatus, HoldingsFilters } from "../holdings/types";

export const DEFAULT_FILTERS: HoldingsFilters = {
  keyword: "",
  asset_type: "",
  opened_from: "",
  opened_to: "",
};

export const HOLDINGS_PAGE_SIZE = 10;

export type HoldingSortKey = "market_value" | "floating_gain" | "floating_gain_percent" | "weight_percent" | "opened_on";

export type HoldingSortState = {
  key: HoldingSortKey;
  direction: "asc" | "desc";
} | null;

export interface PortfolioUrlState {
  selectedPortfolioId?: string;
  activeTab: HoldingStatus;
  filters: HoldingsFilters;
  holdingSort: HoldingSortState;
  holdingPage: number;
}

export function usePortfoliosUrlController() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const urlState = useMemo(() => parsePortfolioUrlState(searchParamsString), [searchParamsString]);

  const updateUrl = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParamsString);
      mutate(next);
      setSearchParams(next, { replace: true });
    },
    [searchParamsString, setSearchParams],
  );

  const setSelectedPortfolioId = useCallback(
    (portfolioId: string | undefined) => {
      updateUrl((next) => {
        if (portfolioId) next.set("portfolio", portfolioId);
        else next.delete("portfolio");
      });
    },
    [updateUrl],
  );

  const setActiveTab = useCallback(
    (nextTab: HoldingStatus) => {
      updateUrl((next) => {
        if (nextTab === "open") next.delete("tab");
        else next.set("tab", nextTab);
        next.delete("page");
      });
    },
    [updateUrl],
  );

  const setFilters = useCallback(
    (nextFilters: HoldingsFilters) => {
      updateUrl((next) => {
        if (nextFilters.keyword.trim()) next.set("keyword", nextFilters.keyword);
        else next.delete("keyword");
        if (nextFilters.asset_type) next.set("asset_type", nextFilters.asset_type);
        else next.delete("asset_type");
        if (nextFilters.opened_from) next.set("opened_from", nextFilters.opened_from);
        else next.delete("opened_from");
        if (nextFilters.opened_to) next.set("opened_to", nextFilters.opened_to);
        else next.delete("opened_to");
        next.delete("page");
      });
    },
    [updateUrl],
  );

  const toggleHoldingSort = useCallback(
    (key: HoldingSortKey) => {
      updateUrl((next) => {
        if (!urlState.holdingSort || urlState.holdingSort.key !== key) {
          next.set("sort", key);
          next.set("direction", "asc");
        } else if (urlState.holdingSort.direction === "asc") {
          next.set("sort", key);
          next.set("direction", "desc");
        } else {
          next.delete("sort");
          next.delete("direction");
        }
        next.delete("page");
      });
    },
    [updateUrl, urlState.holdingSort],
  );

  const resetHoldingList = useCallback(() => {
    updateUrl((next) => {
      next.delete("keyword");
      next.delete("asset_type");
      next.delete("opened_from");
      next.delete("opened_to");
      next.delete("sort");
      next.delete("direction");
      next.delete("page");
    });
  }, [updateUrl]);

  const goToHoldingPage = useCallback(
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
    setSelectedPortfolioId,
    setActiveTab,
    setFilters,
    toggleHoldingSort,
    resetHoldingList,
    goToHoldingPage,
  };
}

export function parsePortfolioUrlState(searchParamsString: string): PortfolioUrlState {
  const params = new URLSearchParams(searchParamsString);
  const parsedPage = Number(params.get("page"));
  const sortKey = params.get("sort");
  const assetType = params.get("asset_type");

  return {
    selectedPortfolioId: params.get("portfolio") ?? undefined,
    activeTab: params.get("tab") === "closed" ? "closed" : "open",
    filters: {
      keyword: params.get("keyword") ?? "",
      asset_type: assetType === "a_share" || assetType === "fund_etf" ? assetType : "",
      opened_from: params.get("opened_from") ?? "",
      opened_to: params.get("opened_to") ?? "",
    },
    holdingSort: isHoldingSortKey(sortKey) ? { key: sortKey, direction: params.get("direction") === "desc" ? "desc" : "asc" } : null,
    holdingPage: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  };
}

function isHoldingSortKey(value: string | null): value is HoldingSortKey {
  return (
    value === "market_value" ||
    value === "floating_gain" ||
    value === "floating_gain_percent" ||
    value === "weight_percent" ||
    value === "opened_on"
  );
}
