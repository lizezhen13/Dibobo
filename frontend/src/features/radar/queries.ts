import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type {
  RadarQuotesResult,
  RadarSearchPayload,
  RadarSearchResult,
  RadarStatus,
} from "./types";

export const radarStatusQueryKey = ["radar", "status"] as const;

export function useRadarStatusQuery() {
  return useQuery({
    queryKey: radarStatusQueryKey,
    queryFn: () => apiFetch<RadarStatus>("/api/radar/status"),
    refetchInterval: (query) => (query.state.data?.state === "syncing" ? 3_000 : false),
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useStartRadarSyncMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ snapshot_id: string; state: "syncing"; message: string }>("/api/radar/sync", {
        method: "POST",
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: radarStatusQueryKey }),
  });
}

export function useRadarSearchMutation() {
  return useMutation({
    mutationFn: (payload: RadarSearchPayload) =>
      apiFetch<RadarSearchResult>("/api/radar/search", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function useRadarQuotesQuery(searchId: string | null, page: number) {
  return useQuery({
    queryKey: ["radar", "quotes", searchId, page],
    queryFn: () =>
      apiFetch<RadarQuotesResult>(
        `/api/radar/quotes?search_id=${encodeURIComponent(searchId ?? "")}&page=${page}`,
      ),
    enabled: Boolean(searchId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled && !document.hidden ? data.refresh_seconds * 1000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
