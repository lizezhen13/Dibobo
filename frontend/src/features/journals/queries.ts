import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type {
  Journal,
  JournalFilters,
  JournalList,
  JournalPayload,
  JournalUpdatePayload,
} from "./types";

export const journalsQueryKey = (filters: JournalFilters) => ["journals", filters] as const;

export function useJournalsQuery(filters: JournalFilters) {
  const params = new URLSearchParams({ page: String(filters.page), page_size: "20" });
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);

  return useQuery({
    queryKey: journalsQueryKey(filters),
    queryFn: () => apiFetch<JournalList>(`/api/journals?${params.toString()}`),
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

function useInvalidateJournals() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["journals"] });
}

export function useCreateJournalMutation() {
  const invalidate = useInvalidateJournals();
  return useMutation({
    mutationFn: (payload: JournalPayload) =>
      apiFetch<Journal>("/api/journals", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateJournalMutation() {
  const invalidate = useInvalidateJournals();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: JournalUpdatePayload }) =>
      apiFetch<Journal>(`/api/journals/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteJournalMutation() {
  const invalidate = useInvalidateJournals();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/journals/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
