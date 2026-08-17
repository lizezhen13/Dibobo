import { useQuery } from "@tanstack/react-query";

import { apiFetchSchema } from "../../lib/api-schema";
import { liveQueryOptions, pollingJitter } from "../../lib/query-lifecycle";
import { queryKeys } from "../../lib/query-keys";
import type { GlobalMarketGroupKey } from "./global-market-types";

export const globalMarketQueryKey = queryKeys.overview.globalMarket;

export async function refreshGlobalMarketGroup(group: GlobalMarketGroupKey) {
  const { globalMarketRefreshSchema } = await import("./global-market-schemas");
  return apiFetchSchema(`/api/overview/global-market/${group}/refresh`, globalMarketRefreshSchema, { method: "POST" });
}

export function useGlobalMarketQuery(enabled: boolean) {
  const jitter = pollingJitter("global-market");

  return useQuery({
    ...liveQueryOptions,
    queryKey: globalMarketQueryKey,
    queryFn: async ({ signal }) => {
      const { globalMarketResponseSchema } = await import("./global-market-schemas");
      return apiFetchSchema("/api/overview/global-market", globalMarketResponseSchema, { signal });
    },
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled ? Math.round(data.refresh_seconds * 1000 * jitter) : false;
    },
  });
}
