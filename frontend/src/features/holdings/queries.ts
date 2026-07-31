import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type {
  Holding,
  HoldingCreatePayload,
  HoldingsList,
  HoldingStatus,
  HoldingSummary,
  HoldingUpdatePayload,
  Instrument,
} from "./types";

export const holdingsQueryKey = (status: HoldingStatus) => ["holdings", status] as const;
export const holdingSummaryQueryKey = ["holdings", "summary"] as const;

export function useHoldingsQuery(status: HoldingStatus) {
  return useQuery({
    queryKey: holdingsQueryKey(status),
    queryFn: () => apiFetch<HoldingsList>(`/api/holdings?status=${status}`),
    refetchInterval: (query) => {
      const data = query.state.data;
      return status === "open" && data?.polling_enabled && !document.hidden
        ? data.refresh_seconds * 1000
        : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useHoldingSummaryQuery() {
  return useQuery({
    queryKey: holdingSummaryQueryKey,
    queryFn: () => apiFetch<HoldingSummary>("/api/holdings/summary"),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled && !document.hidden ? data.refresh_seconds * 1000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useInstrumentSearchQuery(query: string) {
  return useQuery({
    queryKey: ["instruments", "search", query],
    queryFn: () =>
      apiFetch<{ items: Instrument[] }>(`/api/instruments/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

function useInvalidateHoldings() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["holdings"] });
  };
}

export function useCreateHoldingMutation() {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: (payload: HoldingCreatePayload) =>
      apiFetch<Holding>("/api/holdings", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateHoldingMutation() {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: HoldingUpdatePayload }) =>
      apiFetch<Holding>(`/api/holdings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteHoldingMutation() {
  const invalidate = useInvalidateHoldings();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/holdings/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
