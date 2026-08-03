import { useMutation, useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type {
  RadarQuotesResult,
  RadarSearchPayload,
  RadarSearchQueued,
  RadarSearchResult,
  RadarSearchStatus,
  RadarSortField,
  RadarStatus,
  SortDirection,
} from "./types";

export const radarStatusQueryKey = ["radar", "status"] as const;

export function useRadarStatusQuery() {
  return useQuery({
    queryKey: radarStatusQueryKey,
    queryFn: () => apiFetch<RadarStatus>("/api/radar/status"),
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useStartRadarSearchMutation() {
  return useMutation({
    mutationFn: (payload: RadarSearchPayload) =>
      apiFetch<RadarSearchQueued>("/api/radar/search", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  });
}

export function useRadarSearchStatusQuery(searchId: string | null) {
  return useQuery({
    queryKey: ["radar", "search-status", searchId],
    queryFn: () =>
      apiFetch<RadarSearchStatus>(
        `/api/radar/search/${encodeURIComponent(searchId ?? "")}/status`,
      ),
    enabled: Boolean(searchId),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "queued" || state === "running" ? 1_200 : false;
    },
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useRadarResultsQuery(
  searchId: string | null,
  ready: boolean,
  page: number,
  sortBy: RadarSortField,
  sortDirection: SortDirection,
) {
  const params = new URLSearchParams({
    search_id: searchId ?? "",
    page: String(page),
    sort_by: sortBy,
    sort_direction: sortDirection,
  });
  return useQuery({
    queryKey: ["radar", "results", searchId, page, sortBy, sortDirection],
    queryFn: () => apiFetch<RadarSearchResult>(`/api/radar/results?${params.toString()}`),
    enabled: Boolean(searchId) && ready,
    placeholderData: (previous) => previous,
    retry: 1,
  });
}

export function useRadarQuotesQuery(
  searchId: string | null,
  ready: boolean,
  page: number,
  sortBy: RadarSortField,
  sortDirection: SortDirection,
) {
  const params = new URLSearchParams({
    search_id: searchId ?? "",
    page: String(page),
    sort_by: sortBy,
    sort_direction: sortDirection,
  });
  return useQuery({
    queryKey: ["radar", "quotes", searchId, page, sortBy, sortDirection],
    queryFn: () => apiFetch<RadarQuotesResult>(`/api/radar/quotes?${params.toString()}`),
    enabled: Boolean(searchId) && ready,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled && !document.hidden ? data.refresh_seconds * 1000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
