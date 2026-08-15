import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { liveQueryOptions } from "../../lib/query-lifecycle";
import type {
  GlobalMarketGroupKey,
  GlobalMarketRefreshResponse,
  GlobalMarketResponse,
} from "./global-market-types";

export const globalMarketQueryKey = ["overview", "global-market"] as const;

export function refreshGlobalMarketGroup(group: GlobalMarketGroupKey) {
  return apiFetch<GlobalMarketRefreshResponse>(
    `/api/overview/global-market/${group}/refresh`,
    { method: "POST" },
  );
}

export function useGlobalMarketQuery(enabled: boolean) {
  const jitter = useRef(1 + Math.random() * 0.08).current;

  return useQuery({
    ...liveQueryOptions,
    queryKey: globalMarketQueryKey,
    queryFn: ({ signal }) => apiFetch<GlobalMarketResponse>("/api/overview/global-market", { signal }),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled
        ? Math.round(data.refresh_seconds * 1000 * jitter)
        : false;
    },
  });
}
