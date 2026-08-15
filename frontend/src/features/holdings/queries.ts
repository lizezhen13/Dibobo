import { useMutation, useQueries, useQuery, useQueryClient, type Query } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { liveQueryOptions } from "../../lib/query-lifecycle";
import type {
  Holding,
  HoldingCreatePayload,
  HoldingsFilters,
  HoldingsList,
  HoldingStatus,
  HoldingSummary,
  HoldingUpdatePayload,
  Instrument,
  Portfolio,
  PortfolioCreatePayload,
  PortfolioList,
  PortfolioUpdatePayload,
} from "./types";

export const portfoliosQueryKey = ["portfolios"] as const;

export const holdingsQueryKey = (status: HoldingStatus, filters: HoldingsFilters) =>
  ["holdings", status, filters] as const;
export const holdingSummaryQueryKey = ["holdings", "summary"] as const;

export const portfolioHoldingsQueryKey = (
  portfolioId: string,
  status: HoldingStatus,
  filters: HoldingsFilters,
) => ["portfolios", portfolioId, "holdings", status, filters] as const;

export const portfolioSummaryQueryKey = (portfolioId: string) =>
  ["portfolios", portfolioId, "summary"] as const;

export function usePortfoliosQuery() {
  return useQuery({
    queryKey: portfoliosQueryKey,
    queryFn: ({ signal }) => apiFetch<PortfolioList>("/api/portfolios", { signal }),
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function usePortfolioHoldingsQuery(
  portfolioId: string | undefined,
  status: HoldingStatus,
  filters: HoldingsFilters,
  active = true,
) {
  return useQuery({
    queryKey: portfolioId
      ? portfolioHoldingsQueryKey(portfolioId, status, filters)
      : ["portfolios", "empty", "holdings", status, filters],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ status });
      const trimmedKeyword = filters.keyword.trim();
      if (trimmedKeyword) params.set("keyword", trimmedKeyword);
      if (filters.asset_type) params.set("asset_type", filters.asset_type);
      if (filters.opened_from) params.set("opened_from", filters.opened_from);
      if (filters.opened_to) params.set("opened_to", filters.opened_to);
      return apiFetch<HoldingsList>(
        `/api/portfolios/${portfolioId}/holdings?${params.toString()}`,
        { signal },
      );
    },
    ...liveQueryOptions,
    enabled: Boolean(portfolioId) && active,
    refetchInterval: (query) => {
      const data = query.state.data;
      return status === "open" && data?.polling_enabled
        ? data.refresh_seconds * 1000
        : false;
    },
  });
}

export function usePortfolioSummaryQuery(portfolioId: string | undefined) {
  return useQuery({
    ...liveQueryOptions,
    queryKey: portfolioId
      ? portfolioSummaryQueryKey(portfolioId)
      : ["portfolios", "empty", "summary"],
    queryFn: ({ signal }) => apiFetch<HoldingSummary>(`/api/portfolios/${portfolioId}/summary`, { signal }),
    enabled: Boolean(portfolioId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled ? data.refresh_seconds * 1000 : false;
    },
  });
}

export function usePortfolioSummariesQuery(portfolioIds: string[]) {
  return useQueries({
    queries: portfolioIds.map((portfolioId) => ({
      queryKey: portfolioSummaryQueryKey(portfolioId),
      queryFn: ({ signal }) => apiFetch<HoldingSummary>(`/api/portfolios/${portfolioId}/summary`, { signal }),
      ...liveQueryOptions,
      refetchInterval: (query: Query<HoldingSummary>) => {
        const data = query.state.data;
        return data?.polling_enabled ? data.refresh_seconds * 1000 : false;
      },
    })),
  });
}

export function useHoldingsQuery(status: HoldingStatus, filters: HoldingsFilters) {
  return useQuery({
    ...liveQueryOptions,
    queryKey: holdingsQueryKey(status, filters),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ status });
      const trimmedKeyword = filters.keyword.trim();
      if (trimmedKeyword) params.set("keyword", trimmedKeyword);
      if (filters.asset_type) params.set("asset_type", filters.asset_type);
      if (filters.opened_from) params.set("opened_from", filters.opened_from);
      if (filters.opened_to) params.set("opened_to", filters.opened_to);
      return apiFetch<HoldingsList>(`/api/holdings?${params.toString()}`, { signal });
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return status === "open" && data?.polling_enabled
        ? data.refresh_seconds * 1000
        : false;
    },
  });
}

export function useHoldingSummaryQuery() {
  return useQuery({
    ...liveQueryOptions,
    queryKey: holdingSummaryQueryKey,
    queryFn: ({ signal }) => apiFetch<HoldingSummary>("/api/holdings/summary", { signal }),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled ? data.refresh_seconds * 1000 : false;
    },
  });
}

export function useInstrumentSearchQuery(query: string) {
  return useQuery({
    queryKey: ["instruments", "search", query],
    queryFn: ({ signal }) =>
      apiFetch<{ items: Instrument[] }>(
        `/api/instruments/search?q=${encodeURIComponent(query)}`,
        { signal },
      ),
    enabled: query.trim().length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

function useInvalidateHoldings() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["holdings"] });
    void queryClient.invalidateQueries({ queryKey: portfoliosQueryKey });
  };
}

export function useCreateHoldingMutation(portfolioId?: string) {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: (payload: HoldingCreatePayload) =>
      apiFetch<Holding>(
        portfolioId ? `/api/portfolios/${portfolioId}/holdings` : "/api/holdings",
        {
        method: "POST",
        body: JSON.stringify(payload),
        },
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateHoldingMutation(portfolioId?: string) {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: HoldingUpdatePayload }) =>
      apiFetch<Holding>(
        portfolioId ? `/api/portfolios/${portfolioId}/holdings/${id}` : `/api/holdings/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteHoldingMutation(portfolioId?: string) {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(
        portfolioId ? `/api/portfolios/${portfolioId}/holdings/${id}` : `/api/holdings/${id}`,
        { method: "DELETE" },
      ),
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
        queryKey: ["portfolios", portfolioId, "holdings"],
      });
    },
  });
}

function useInvalidatePortfolios() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: portfoliosQueryKey });
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
  const invalidate = useInvalidatePortfolios();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/portfolios/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useSetDefaultPortfolioMutation() {
  const invalidate = useInvalidatePortfolios();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Portfolio>(`/api/portfolios/${id}/default`, { method: "POST" }),
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
