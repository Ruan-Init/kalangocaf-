import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useProducts() {
  return useQuery(orpc.catalog.list.queryOptions({ staleTime: 60_000 }));
}

export function useProduct(slug: string) {
  return useQuery(orpc.catalog.get.queryOptions({ input: { slug }, staleTime: 60_000 }));
}

export function useRelated(slug: string, limit = 3) {
  return useQuery(
    orpc.catalog.related.queryOptions({ input: { slug, limit }, staleTime: 60_000 })
  );
}

export function useMerch() {
  return useQuery(orpc.catalog.merch.queryOptions({ staleTime: 60_000 }));
}
