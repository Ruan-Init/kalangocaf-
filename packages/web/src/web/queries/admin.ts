import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Painel de gestão: tudo aqui depende do token (OPS_TOKEN) que o operador digita. */

export function useAdminSummary(token: string) {
  return useQuery(
    orpc.admin.summary.queryOptions({
      input: { token },
      enabled: Boolean(token),
      staleTime: 15_000,
    })
  );
}

export function useAdminOrders(token: string, status?: string) {
  return useQuery(
    orpc.admin.orders.queryOptions({
      input: { token, status: status as never },
      enabled: Boolean(token),
      staleTime: 15_000,
    })
  );
}

export function useAdminLeads(token: string) {
  return useQuery(
    orpc.admin.leads.queryOptions({
      input: { token },
      enabled: Boolean(token),
      staleTime: 15_000,
    })
  );
}

export function useCheckToken() {
  return useMutation(orpc.admin.check.mutationOptions());
}

export function useSetStatus() {
  return useMutation(orpc.admin.setStatus.mutationOptions());
}

export function useShipOrder() {
  return useMutation(orpc.admin.ship.mutationOptions());
}

export function useRetryConfirmation() {
  return useMutation(orpc.admin.retryConfirmation.mutationOptions());
}

export function useAdminMerch(token: string) {
  return useQuery(
    orpc.admin.merchList.queryOptions({ input: { token }, enabled: Boolean(token), staleTime: 5_000 })
  );
}

export function useSaveMerch() {
  return useMutation(orpc.admin.merchSave.mutationOptions());
}

export function useRemoveMerch() {
  return useMutation(orpc.admin.merchRemove.mutationOptions());
}

export function useAdminCoffees(token: string) {
  return useQuery(
    orpc.admin.coffeeList.queryOptions({ input: { token }, enabled: Boolean(token), staleTime: 5_000 })
  );
}

export function useSaveCoffee() {
  return useMutation(orpc.admin.coffeeSave.mutationOptions());
}

export function useRemoveCoffee() {
  return useMutation(orpc.admin.coffeeRemove.mutationOptions());
}

export function useRetryPublication() {
  return useMutation(orpc.admin.retryPublication.mutationOptions());
}
