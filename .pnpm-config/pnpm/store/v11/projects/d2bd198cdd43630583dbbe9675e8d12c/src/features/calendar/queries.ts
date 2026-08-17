import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { apiFetchSchema } from "../../lib/api-schema";
import { queryKeys } from "../../lib/query-keys";
import type { CalendarEventsResponse, CalendarQueryParams } from "./types";

export function calendarQueryKey(params: CalendarQueryParams) {
  return queryKeys.calendar.events(params);
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
    queryFn: async ({ signal }) => {
      const { calendarEventsSchema } = await import("./schemas");
      return apiFetchSchema(`/api/calendar/events?${toSearchParams(params)}`, calendarEventsSchema, { signal });
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useCalendarFiltersQuery(category: CalendarQueryParams["category"]) {
  return useQuery({
    queryKey: queryKeys.calendar.filters(category),
    queryFn: async ({ signal }) => {
      const { calendarFiltersSchema } = await import("./schemas");
      return apiFetchSchema(`/api/calendar/filters?category=${encodeURIComponent(category)}`, calendarFiltersSchema, { signal });
    },
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
