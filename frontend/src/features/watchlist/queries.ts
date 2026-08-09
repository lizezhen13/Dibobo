import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type {
  WatchlistCreatePayload,
  WatchlistFilters,
  WatchlistResponse,
  WatchlistUpdatePayload,
} from "./types";

export const watchlistQueryKey = (filters: WatchlistFilters) =>
  ["watchlist", filters] as const;

export function useWatchlistQuery(filters: WatchlistFilters) {
  return useQuery({
    queryKey: watchlistQueryKey(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      const keyword = filters.keyword.trim();
      if (keyword) params.set("keyword", keyword);
      if (filters.asset_type) params.set("asset_type", filters.asset_type);
      const query = params.toString();
      return apiFetch<WatchlistResponse>(`/api/watchlist${query ? `?${query}` : ""}`);
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled && !document.hidden ? data.refresh_seconds * 1000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

function useInvalidateWatchlist() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["watchlist"] });
  };
}

export function useCreateWatchlistMutation() {
  const invalidate = useInvalidateWatchlist();
  return useMutation({
    mutationFn: (payload: WatchlistCreatePayload) =>
      apiFetch<unknown>("/api/watchlist", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateWatchlistMutation() {
  const invalidate = useInvalidateWatchlist();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: WatchlistUpdatePayload }) =>
      apiFetch<unknown>(`/api/watchlist/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteWatchlistMutation() {
  const invalidate = useInvalidateWatchlist();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/watchlist/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useBatchDeleteWatchlistMutation() {
  const invalidate = useInvalidateWatchlist();
  return useMutation({
    mutationFn: (itemIds: string[]) =>
      apiFetch<{ message: string }>("/api/watchlist/batch-delete", {
        method: "POST",
        body: JSON.stringify({ item_ids: itemIds }),
      }),
    onSuccess: invalidate,
  });
}

export function useReorderWatchlistMutation() {
  const invalidate = useInvalidateWatchlist();
  return useMutation({
    mutationFn: (itemIds: string[]) =>
      apiFetch<{ message: string }>("/api/watchlist/order", {
        method: "PATCH",
        body: JSON.stringify({ item_ids: itemIds }),
      }),
    onSuccess: invalidate,
  });
}
