import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, apiFetch } from "../../lib/api";
import { apiFetchSchema } from "../../lib/api-schema";
import { liveQueryOptions, pollingJitter } from "../../lib/query-lifecycle";
import { queryKeys } from "../../lib/query-keys";
import type {
  Holding,
  HoldingCreatePayload,
  HoldingsFilters,
  HoldingStatus,
  HoldingUpdatePayload,
  Portfolio,
  PortfolioCreatePayload,
  PortfolioList,
  PortfolioSummaryList,
  PortfolioUpdatePayload,
} from "./types";

export const portfoliosQueryKey = queryKeys.portfolios.all;

export const holdingsQueryKey = (status: HoldingStatus, filters: HoldingsFilters) => queryKeys.holdings.list(status, filters);
export const holdingSummaryQueryKey = queryKeys.holdings.summary;

export const portfolioHoldingsQueryKey = (portfolioId: string, status: HoldingStatus, filters: HoldingsFilters) =>
  queryKeys.portfolios.holdings(portfolioId, status, filters);

export const portfolioSummaryQueryKey = (portfolioId: string) => queryKeys.portfolios.summary(portfolioId);

export function usePortfoliosQuery() {
  return useQuery({
    queryKey: portfoliosQueryKey,
    queryFn: async ({ signal }) => {
      const { portfolioListSchema } = await import("./schemas");
      return apiFetchSchema("/api/portfolios", portfolioListSchema, { signal });
    },
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function usePortfolioHoldingsQuery(portfolioId: string | undefined, status: HoldingStatus, filters: HoldingsFilters, active = true) {
  return useQuery({
    queryKey: portfolioId ? portfolioHoldingsQueryKey(portfolioId, status, filters) : queryKeys.portfolios.emptyHoldings(status, filters),
    queryFn: async ({ signal }) => {
      const { holdingsListSchema } = await import("./schemas");
      const params = new URLSearchParams({ status });
      const trimmedKeyword = filters.keyword.trim();
      if (trimmedKeyword) params.set("keyword", trimmedKeyword);
      if (filters.asset_type) params.set("asset_type", filters.asset_type);
      if (filters.opened_from) params.set("opened_from", filters.opened_from);
      if (filters.opened_to) params.set("opened_to", filters.opened_to);
      return apiFetchSchema(`/api/portfolios/${portfolioId}/holdings?${params.toString()}`, holdingsListSchema, { signal });
    },
    ...liveQueryOptions,
    enabled: Boolean(portfolioId) && active,
    refetchInterval: (query) => {
      const data = query.state.data;
      return status === "open" && data?.polling_enabled ? data.refresh_seconds * 1000 : false;
    },
  });
}

export function usePortfolioSummaryQuery(portfolioId: string | undefined) {
  return useQuery({
    ...liveQueryOptions,
    queryKey: portfolioId ? portfolioSummaryQueryKey(portfolioId) : queryKeys.portfolios.emptySummary,
    queryFn: async ({ signal }) => {
      const { holdingSummarySchema } = await import("./schemas");
      return apiFetchSchema(`/api/portfolios/${portfolioId}/summary`, holdingSummarySchema, { signal });
    },
    enabled: Boolean(portfolioId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled ? data.refresh_seconds * 1000 : false;
    },
  });
}

export function usePortfolioSummariesQuery(portfolioIds: string[]) {
  const ids = [...new Set(portfolioIds)].sort();
  const query = useQuery({
    ...liveQueryOptions,
    queryKey: queryKeys.portfolios.summaries(ids),
    queryFn: ({ signal }) => fetchPortfolioSummaries(ids, signal),
    enabled: ids.length > 0,
    refetchInterval: (currentQuery) => {
      const intervals = (currentQuery.state.data?.items ?? [])
        .filter((item) => item.summary.polling_enabled)
        .map((item) => item.summary.refresh_seconds * 1000 * pollingJitter(`portfolio:${item.portfolio_id}`));
      return intervals.length > 0 ? Math.min(...intervals) : false;
    },
  });

  return portfolioIds.map((portfolioId) => {
    const item = query.data?.items.find((entry) => entry.portfolio_id === portfolioId);
    return {
      data: item?.summary,
      isLoading: query.isPending,
      isError: query.isError,
      error: query.error,
    };
  });
}

async function fetchPortfolioSummaries(ids: string[], signal: AbortSignal): Promise<PortfolioSummaryList> {
  const { holdingSummarySchema, portfolioSummaryListSchema } = await import("./schemas");
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  try {
    return await apiFetchSchema(`/api/portfolios/summaries?${params.toString()}`, portfolioSummaryListSchema, { signal });
  } catch (error) {
    // Keep old deployments functional while the batch endpoint rolls out.
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const items = await Promise.all(
      ids.map(async (portfolioId) => ({
        portfolio_id: portfolioId,
        summary: await apiFetchSchema(`/api/portfolios/${portfolioId}/summary`, holdingSummarySchema, { signal }),
      })),
    );
    return { items };
  }
}

export function useHoldingsQuery(status: HoldingStatus, filters: HoldingsFilters) {
  return useQuery({
    ...liveQueryOptions,
    queryKey: holdingsQueryKey(status, filters),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ status });
      const trimmedKeyword = filters.keyword.trim();
      if (trimmedKeyword) params.set("keyword", trimmedKeyword);
      if (filters.asset_type) params.set("asset_type", filters.asset_type);
      if (filters.opened_from) params.set("opened_from", filters.opened_from);
      if (filters.opened_to) params.set("opened_to", filters.opened_to);
      const { holdingsListSchema } = await import("./schemas");
      return apiFetchSchema(`/api/holdings?${params.toString()}`, holdingsListSchema, { signal });
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return status === "open" && data?.polling_enabled ? data.refresh_seconds * 1000 : false;
    },
  });
}

export function useHoldingSummaryQuery() {
  return useQuery({
    ...liveQueryOptions,
    queryKey: holdingSummaryQueryKey,
    queryFn: async ({ signal }) => {
      const { holdingSummarySchema } = await import("./schemas");
      return apiFetchSchema("/api/holdings/summary", holdingSummarySchema, { signal });
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled ? data.refresh_seconds * 1000 : false;
    },
  });
}

export function useInstrumentSearchQuery(query: string) {
  return useQuery({
    queryKey: queryKeys.instruments.search(query),
    queryFn: async ({ signal }) => {
      const { instrumentSearchSchema } = await import("./schemas");
      return apiFetchSchema(`/api/instruments/search?q=${encodeURIComponent(query)}`, instrumentSearchSchema, { signal });
    },
    enabled: query.trim().length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

function useInvalidateHoldings(portfolioId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.holdings.all });
    if (portfolioId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolios.holdingsRoot(portfolioId) });
      void queryClient.invalidateQueries({ queryKey: portfolioSummaryQueryKey(portfolioId), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolios.summariesRoot });
      void queryClient.invalidateQueries({ queryKey: portfoliosQueryKey, exact: true });
    } else {
      void queryClient.invalidateQueries({ queryKey: holdingSummaryQueryKey, exact: true });
    }
  };
}

export function useCreateHoldingMutation(portfolioId?: string) {
  const invalidate = useInvalidateHoldings(portfolioId);
  return useMutation({
    mutationFn: (payload: HoldingCreatePayload) =>
      apiFetch<Holding>(portfolioId ? `/api/portfolios/${portfolioId}/holdings` : "/api/holdings", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateHoldingMutation(portfolioId?: string) {
  const invalidate = useInvalidateHoldings(portfolioId);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: HoldingUpdatePayload }) =>
      apiFetch<Holding>(portfolioId ? `/api/portfolios/${portfolioId}/holdings/${id}` : `/api/holdings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteHoldingMutation(portfolioId?: string) {
  const invalidate = useInvalidateHoldings(portfolioId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(portfolioId ? `/api/portfolios/${portfolioId}/holdings/${id}` : `/api/holdings/${id}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}

export function useReorderPortfolioHoldingsMutation(portfolioId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (holdingIds: string[]) => {
      if (!portfolioId) throw new Error("未选择投资组合");
      return apiFetch<{ message: string }>(`/api/portfolios/${portfolioId}/holdings/order`, {
        method: "PATCH",
        body: JSON.stringify({ holding_ids: holdingIds }),
      });
    },
    onSuccess: () => {
      if (!portfolioId) return;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.portfolios.holdingsRoot(portfolioId),
      });
    },
  });
}

function useInvalidatePortfolios() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: portfoliosQueryKey, exact: true });
  };
}

export function useCreatePortfolioMutation() {
  const invalidate = useInvalidatePortfolios();
  return useMutation({
    mutationFn: (payload: PortfolioCreatePayload) =>
      apiFetch<Portfolio>("/api/portfolios", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePortfolioMutation() {
  const invalidate = useInvalidatePortfolios();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PortfolioUpdatePayload }) =>
      apiFetch<Portfolio>(`/api/portfolios/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePortfolioMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePortfolios();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ message: string }>(`/api/portfolios/${id}`, { method: "DELETE" }),
    onSuccess: (_, portfolioId) => {
      invalidate();
      queryClient.removeQueries({ queryKey: queryKeys.portfolios.root(portfolioId) });
    },
  });
}

export function useSetDefaultPortfolioMutation() {
  const invalidate = useInvalidatePortfolios();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Portfolio>(`/api/portfolios/${id}/default`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useReorderPortfoliosMutation() {
  const invalidate = useInvalidatePortfolios();
  return useMutation({
    mutationFn: (portfolioIds: string[]) =>
      apiFetch<PortfolioList>("/api/portfolios/order", {
        method: "PATCH",
        body: JSON.stringify({ portfolio_ids: portfolioIds }),
      }),
    onSuccess: invalidate,
  });
}
