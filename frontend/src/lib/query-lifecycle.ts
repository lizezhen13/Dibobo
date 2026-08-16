import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Defaults for data that must stay fresh while its owning page is visible.
 * React Query keeps the last successful value in its cache, but treats it as
 * stale immediately so returning to the page always triggers a fresh read.
 */
export const liveQueryOptions = {
  staleTime: 0,
  // LiveQueryVisibilityManager owns focus/visibility refreshes so it can
  // stagger several active queries instead of refetching them all at once.
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  retry: 1,
  meta: { live: true },
} as const;

/** Stable per-query jitter prevents synchronized polling without render-time randomness. */
export function pollingJitter(key: string): number {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return 1 + (hash % 80) / 1_000;
}

/**
 * React Query already pauses interval timers in a hidden document. This small
 * manager makes the resume behavior explicit: active live queries are
 * refreshed once when the document becomes visible or the window regains
 * focus. A small stagger prevents one browser transition from producing a
 * request burst when a page owns several live queries.
 */
export function LiveQueryVisibilityManager() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let lastRefreshAt = 0;
    let scheduledRefreshes: number[] = [];

    const clearScheduledRefreshes = () => {
      for (const timer of scheduledRefreshes) window.clearTimeout(timer);
      scheduledRefreshes = [];
    };

    const scheduleLiveQueryRefresh = () => {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastRefreshAt < 1_000) return;
      lastRefreshAt = now;

      clearScheduledRefreshes();
      const liveQueries = queryClient
        .getQueryCache()
        .findAll({ type: "active" })
        .filter((query) => query.meta?.live === true);

      scheduledRefreshes = liveQueries.map((query, index) =>
        window.setTimeout(
          () => {
            if (document.visibilityState !== "visible") return;
            void queryClient.refetchQueries(
              {
                type: "active",
                exact: true,
                queryKey: query.queryKey,
                predicate: (candidate) => candidate.meta?.live === true,
              },
              { cancelRefetch: false },
            );
          },
          Math.min(index * 120, 1_200),
        ),
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearScheduledRefreshes();
        lastRefreshAt = 0;
        void queryClient.cancelQueries({
          type: "active",
          predicate: (query) => query.meta?.live === true,
        });
        return;
      }
      scheduleLiveQueryRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", scheduleLiveQueryRefresh);

    return () => {
      clearScheduledRefreshes();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", scheduleLiveQueryRefresh);
    };
  }, [queryClient]);

  return null;
}
