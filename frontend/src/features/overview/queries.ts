import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { OverviewIndices } from "./types";

export const overviewQueryKey = ["overview", "indices"] as const;

export function useOverviewQuery() {
  return useQuery({
    queryKey: overviewQueryKey,
    queryFn: () => apiFetch<OverviewIndices>("/api/overview/indices"),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.polling_enabled && !document.hidden ? data.refresh_seconds * 1000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

