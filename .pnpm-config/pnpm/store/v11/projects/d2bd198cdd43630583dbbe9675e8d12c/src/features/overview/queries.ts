import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiFetchSchema } from "../../lib/api-schema";
import { liveQueryOptions, pollingJitter } from "../../lib/query-lifecycle";
import { queryKeys } from "../../lib/query-keys";
import type {
  OverviewHotStocks,
  OverviewIndices,
  OverviewIndustries,
  OverviewMarketBreadth,
  OverviewMarketTemperature,
} from "./types";
import type { ZodType } from "zod";

export const overviewQueryKey = queryKeys.overview.all;

const initialDelay = {
  indices: 0,
  // Keep a small spread between modules so the first paint is not followed by
  // a request burst, while avoiding multi-second gates for visible cards.
  hotStocks: 150,
  marketTemperature: 300,
  marketBreadth: 450,
  industries: 750,
} as const;

interface PollingModule {
  polling_enabled: boolean;
  refresh_seconds: number;
}

function useStaggeredEnabled(delayMs: number, active: boolean) {
  const [delayElapsed, setDelayElapsed] = useState(delayMs === 0);

  useEffect(() => {
    if (!active || delayMs === 0 || delayElapsed) return;

    const timer = window.setTimeout(() => setDelayElapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayElapsed, delayMs]);

  return active && (delayMs === 0 || delayElapsed);
}

function useOverviewModule<T extends PollingModule>(
  slug: string,
  path: string,
  delayMs: number,
  active: boolean,
  schemaLoader: () => Promise<ZodType<T>>,
) {
  const enabled = useStaggeredEnabled(delayMs, active);
  const jitter = pollingJitter(slug);

  return useQuery({
    ...liveQueryOptions,
    queryKey: queryKeys.overview.module(slug),
    queryFn: async ({ signal }) => apiFetchSchema(path, await schemaLoader(), { signal }),
    enabled: active && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled ? Math.round(data.refresh_seconds * 1000 * jitter) : false;
    },
  });
}

export function useOverviewQuery(active = true) {
  return useOverviewModule<OverviewIndices>("indices", "/api/overview/indices", initialDelay.indices, active, async () => {
    const { overviewIndicesSchema } = await import("./schemas");
    return overviewIndicesSchema;
  });
}

export function useHotStocksQuery(active = true) {
  return useOverviewModule<OverviewHotStocks>("hot-stocks", "/api/overview/hot-stocks", initialDelay.hotStocks, active, async () => {
    const { overviewHotStocksSchema } = await import("./schemas");
    return overviewHotStocksSchema;
  });
}

export function useMarketBreadthQuery(active = true) {
  return useOverviewModule<OverviewMarketBreadth>(
    "market-breadth",
    "/api/overview/market-breadth",
    initialDelay.marketBreadth,
    active,
    async () => {
      const { overviewMarketBreadthSchema } = await import("./schemas");
      return overviewMarketBreadthSchema;
    },
  );
}

export function useMarketTemperatureQuery(active = true) {
  return useOverviewModule<OverviewMarketTemperature>(
    "market-temperature",
    "/api/overview/market-temperature",
    initialDelay.marketTemperature,
    active,
    async () => {
      const { overviewMarketTemperatureSchema } = await import("./schemas");
      return overviewMarketTemperatureSchema;
    },
  );
}

export function useIndustriesQuery(active = true) {
  return useOverviewModule<OverviewIndustries>("industries", "/api/overview/industries", initialDelay.industries, active, async () => {
    const { overviewIndustriesSchema } = await import("./schemas");
    return overviewIndustriesSchema;
  });
}
