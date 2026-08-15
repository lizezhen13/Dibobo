import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type {
  CalendarEventsResponse,
  CalendarFiltersResponse,
  CalendarQueryParams,
} from "./types";

export function calendarQueryKey(params: CalendarQueryParams) {
  return [
    "calendar-events-v3",
    params.category,
    params.from,
    params.to,
    params.markets.join(","),
    params.scope,
    params.importance.join(","),
  ] as const;
}

function toSearchParams(params: CalendarQueryParams) {
  const search = new URLSearchParams({
    category: params.category,
    from: params.from,
    to: params.to,
    scope: params.scope,
  });
  if (params.markets.length > 0) search.set("markets", params.markets.join(","));
  if (params.importance.length > 0) search.set("importance", params.importance.join(","));
  return search;
}

export function useCalendarEventsQuery(params: CalendarQueryParams) {
  return useQuery({
    queryKey: calendarQueryKey(params),
    queryFn: ({ signal }) =>
      apiFetch<CalendarEventsResponse>(`/api/calendar/events?${toSearchParams(params)}`, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useCalendarFiltersQuery(category: CalendarQueryParams["category"]) {
  return useQuery({
    queryKey: ["calendar-filters", category],
    queryFn: ({ signal }) =>
      apiFetch<CalendarFiltersResponse>(
        `/api/calendar/filters?category=${encodeURIComponent(category)}`,
        { signal },
      ),
    staleTime: 5 * 60_000,
  });
}

export function useRefreshCalendarMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CalendarQueryParams) =>
      apiFetch<CalendarEventsResponse>("/api/calendar/refresh", {
        method: "POST",
        body: JSON.stringify({
          category: params.category,
          from: params.from,
          to: params.to,
          markets: params.markets,
          scope: params.scope,
          importance: params.importance,
        }),
      }),
    onSuccess: (response, params) => {
      queryClient.setQueryData(calendarQueryKey(params), response);
    },
  });
}
