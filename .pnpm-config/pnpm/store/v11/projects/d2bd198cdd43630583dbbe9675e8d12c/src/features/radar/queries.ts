import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { apiFetchSchema } from "../../lib/api-schema";
import { liveQueryOptions } from "../../lib/query-lifecycle";
import { queryKeys } from "../../lib/query-keys";
import { radarResponseSchema } from "./schemas";
import type { RadarSearchPayload, RadarWatchlistPayload } from "./types";

export const RADAR_PAGE_SIZE = 10;

export function useRadarDailyQuery(page: number, pageSize = RADAR_PAGE_SIZE) {
  return useQuery({
    ...liveQueryOptions,
    staleTime: 15_000,
    queryKey: queryKeys.radar.daily(page, pageSize),
    queryFn: ({ signal }) => apiFetchSchema(`/api/radar?page=${page}&page_size=${pageSize}`, radarResponseSchema, { signal }),
  });
}

export function useRadarSearchMutation() {
  return useMutation({
    mutationFn: (payload: RadarSearchPayload) =>
      apiFetchSchema("/api/radar/search", radarResponseSchema, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function useAddRadarWatchlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RadarWatchlistPayload) =>
      apiFetch<unknown>("/api/watchlist/from-radar", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.all });
    },
  });
}

export function useRemoveRadarWatchlistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ thscode }: { thscode: string }) =>
      apiFetch<unknown>(`/api/watchlist/by-thscode/${encodeURIComponent(thscode)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.all });
    },
  });
}
