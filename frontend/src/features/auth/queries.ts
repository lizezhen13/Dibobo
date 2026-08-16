import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { apiFetchSchema } from "../../lib/api-schema";
import { clearUserScopedQueryCache } from "../../lib/query-cache";
import { queryKeys } from "../../lib/query-keys";

export const sessionQueryKey = queryKeys.auth.session;

export function useSessionQuery() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: async ({ signal }) => {
      const { sessionSchema } = await import("./schemas");
      return apiFetchSchema("/api/auth/me", sessionSchema, { signal });
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { username: string; password: string }) => {
      const { sessionSchema } = await import("./schemas");
      return apiFetchSchema("/api/auth/login", sessionSchema, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (session) => {
      clearUserScopedQueryCache(queryClient);
      queryClient.setQueryData(sessionQueryKey, session);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ message: string }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      clearUserScopedQueryCache(queryClient);
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });
}
