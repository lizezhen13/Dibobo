import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api";
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

function useStaggeredEnabled(delayMs: number) {
  const [enabled, setEnabled] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs === 0) return;
    const timer = window.setTimeout(() => setEnabled(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return enabled;
}

function useOverviewModule<T extends PollingModule>(
  slug: string,
  path: string,
  delayMs: number,
) {
  const enabled = useStaggeredEnabled(delayMs);
  const jitter = useRef(1 + Math.random() * 0.08).current;

  return useQuery({
    queryKey: [...overviewQueryKey, slug],
    queryFn: () => apiFetch<T>(path),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled
        ? Math.round(data.refresh_seconds * 1000 * jitter)
        : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useOverviewQuery() {
  return useOverviewModule<OverviewIndices>(
    "indices",
    "/api/overview/indices",
    initialDelay.indices,
  );
}

export function useHotStocksQuery() {
  return useOverviewModule<OverviewHotStocks>(
    "hot-stocks",
    "/api/overview/hot-stocks",
    initialDelay.hotStocks,
  );
}

export function useMarketBreadthQuery() {
  return useOverviewModule<OverviewMarketBreadth>(
    "market-breadth",
    "/api/overview/market-breadth",
    initialDelay.marketBreadth,
  );
}

export function useIndustriesQuery() {
  return useOverviewModule<OverviewIndustries>(
    "industries",
    "/api/overview/industries",
    initialDelay.industries,
  );
}
