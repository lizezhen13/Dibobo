import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionQueryKey } from "../auth/queries";
import { apiFetch } from "../../lib/api";
import { overviewQueryKey } from "../overview/queries";
import type { ConnectionTestResult, DataSource, DataSourcePayload } from "./types";

export const dataSourcesQueryKey = ["settings", "data-sources"] as const;

export function useDataSourcesQuery() {
  return useQuery({
    queryKey: dataSourcesQueryKey,
    queryFn: () => apiFetch<DataSource[]>("/api/settings/data-sources"),
  });
}

export function useCreateDataSourceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DataSourcePayload) =>
      apiFetch<DataSource>("/api/settings/data-sources", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey }),
  });
}

export function useUpdateDataSourceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DataSourcePayload }) =>
      apiFetch<DataSource>(`/api/settings/data-sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey }),
        queryClient.invalidateQueries({ queryKey: overviewQueryKey }),
      ]);
    },
  });
}

export function useTestDataSourceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ConnectionTestResult>(`/api/settings/data-sources/${id}/test`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey }),
  });
}

export function useActivateDataSourceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DataSource>(`/api/settings/data-sources/${id}/activate`, { method: "POST" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey }),
        queryClient.invalidateQueries({ queryKey: overviewQueryKey }),
      ]);
    },
  });
}

export function useDeleteDataSourceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/settings/data-sources/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dataSourcesQueryKey }),
        queryClient.invalidateQueries({ queryKey: overviewQueryKey }),
      ]);
    },
  });
}

export function useChangePasswordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      current_password: string;
      new_password: string;
      confirm_password: string;
    }) =>
      apiFetch<{ message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.setQueryData(sessionQueryKey, null),
  });
}
