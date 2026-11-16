import { useMutation } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useCreateLead() {
  return useMutation(orpc.leads.create.mutationOptions());
}

export function useCreateClubSubscription() {
  return useMutation(orpc.club.create.mutationOptions());
}
