import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Integração com o Bling — tudo protegido pela senha do painel (OPS_TOKEN). */

export function useBlingStatus(token: string) {
  return useQuery(
    orpc.bling.status.queryOptions({
      input: { token },
      enabled: Boolean(token),
      staleTime: 10_000,
      refetchOnWindowFocus: "always",
      refetchInterval: (q) => (q.state.data?.syncing ? 3_000 : false),
    })
  );
}

export function useBlingOptions(token: string, enabled: boolean) {
  return useQuery(
    orpc.bling.options.queryOptions({
      input: { token },
      enabled: Boolean(token) && enabled,
      staleTime: 5 * 60_000,
      retry: false,
    })
  );
}

export function useBlingAuthorizeUrl() {
  return useMutation(orpc.bling.authorizeUrl.mutationOptions());
}

export function useBlingDisconnect() {
  return useMutation(orpc.bling.disconnect.mutationOptions());
}

export function useBlingSaveSettings() {
  return useMutation(orpc.bling.saveSettings.mutationOptions());
}

export function useBlingSync() {
  return useMutation(orpc.bling.sync.mutationOptions());
}

export function useBlingPushOrder() {
  return useMutation(orpc.bling.pushOrder.mutationOptions());
}
