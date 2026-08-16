import type { QueryClient } from "@tanstack/react-query";

const isAuthQuery = (queryKey: readonly unknown[]) => queryKey[0] === "auth";

/**
 * User-owned query data must not survive an account boundary. Keeping the
 * session query allows AuthGuard to make the next routing decision while all
 * portfolio, market, watchlist and settings data is removed.
 */
export function clearUserScopedQueryCache(queryClient: QueryClient) {
  void queryClient.cancelQueries({
    predicate: (query) => !isAuthQuery(query.queryKey),
  });
  queryClient.removeQueries({
    predicate: (query) => !isAuthQuery(query.queryKey),
  });
}
