import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api";
import { liveQueryOptions } from "../../lib/query-lifecycle";
import type {
  OverviewHotStocks,
  OverviewIndices,
  OverviewIndustries,
  OverviewMarketBreadth,
} from "./types";

export const overviewQueryKey = ["overview"] as const;

const initialDelay = {
  indices: 0,
  hotStocks: 650,
  marketBreadth: 2450,
  industries: 3600,
} as const;

interface PollingModule {
  polling_enabled: boolean;
  refresh_seconds: number;
}

function useStaggeredEnabled(delayMs: number, active: boolean) {
  const [enabled, setEnabled] = useState(active && delayMs === 0);

  useEffect(() => {
    if (!active) {
      setEnabled(false);
      return;
    }
    if (delayMs === 0) {
      setEnabled(true);
      return;
    }

    setEnabled(false);
    const timer = window.setTimeout(() => setEnabled(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return enabled;
}

function useOverviewModule<T extends PollingModule>(
  slug: string,
  path: string,
  delayMs: number,
  active: boolean,
) {
  const enabled = useStaggeredEnabled(delayMs, active);
  const jitter = useRef(1 + Math.random() * 0.08).current;

  return useQuery({
    ...liveQueryOptions,
    queryKey: [...overviewQueryKey, slug],
    queryFn: ({ signal }) => apiFetch<T>(path, { signal }),
    enabled: active && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled
        ? Math.round(data.refresh_seconds * 1000 * jitter)
        : false;
    },
  });
}

export function useOverviewQuery(active = true) {
  return useOverviewModule<OverviewIndices>(
    "indices",
    "/api/overview/indices",
    initialDelay.indices,
    active,
  );
}

export function useHotStocksQuery(active = true) {
  return useOverviewModule<OverviewHotStocks>(
    "hot-stocks",
    "/api/overview/hot-stocks",
    initialDelay.hotStocks,
    active,
  );
}

export function useMarketBreadthQuery(active = true) {
  return useOverviewModule<OverviewMarketBreadth>(
    "market-breadth",
    "/api/overview/market-breadth",
    initialDelay.marketBreadth,
    active,
  );
}

export function useIndustriesQuery(active = true) {
  return useOverviewModule<OverviewIndustries>(
    "industries",
    "/api/overview/industries",
    initialDelay.industries,
    active,
  );
}
