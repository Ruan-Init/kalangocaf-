import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useRecipes() {
  return useQuery(orpc.recipes.list.queryOptions({ staleTime: 60_000 }));
}

export function useRecipeTexts() {
  return useQuery(orpc.recipes.texts.queryOptions({ staleTime: 60_000 }));
}

export function useAdminRecipes(token: string) {
  return useQuery(
    orpc.recipes.adminList.queryOptions({ input: { token }, enabled: !!token, staleTime: 5_000 })
  );
}

export function useSaveRecipe() {
  return useMutation(orpc.recipes.save.mutationOptions());
}

export function useRemoveRecipe() {
  return useMutation(orpc.recipes.remove.mutationOptions());
}

export function useSetRecipeTexts() {
  return useMutation(orpc.recipes.setTexts.mutationOptions());
}
