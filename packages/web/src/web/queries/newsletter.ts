import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useNewsletterSummary(token: string) {
  return useQuery(orpc.newsletter.summary.queryOptions({ input: { token }, enabled: Boolean(token), staleTime: 5000 }));
}
export function useNewsletterSubscribers(token: string, search: string, status: "all" | "subscribed" | "unsubscribed", page: number) {
  return useQuery(orpc.newsletter.subscribers.queryOptions({ input: { token, search, status, page }, enabled: Boolean(token) }));
}
export function useNewsletterCampaigns(token: string) {
  return useQuery(orpc.newsletter.campaigns.queryOptions({ input: { token }, enabled: Boolean(token) }));
}
export function useNewsletterRecipients(token: string, id: number, page: number) {
  return useQuery(orpc.newsletter.campaignRecipients.queryOptions({ input: { token, id, page }, enabled: Boolean(token && id) }));
}
export function useNewsletterSubscription(token: string) {
  return useQuery(orpc.newsletter.subscription.queryOptions({ input: { token }, enabled: /^[a-f0-9]{64}$/.test(token), retry: false }));
}
export function useNewsletterUnsubscribe() {
  const qc = useQueryClient();
  return useMutation(orpc.newsletter.unsubscribe.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: orpc.newsletter.key() }) }));
}
export function useSaveCampaign() {
  const qc = useQueryClient();
  return useMutation(orpc.newsletter.saveCampaign.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: orpc.newsletter.key() }) }));
}
export function usePrepareCampaign() {
  return useMutation(orpc.newsletter.prepare.mutationOptions());
}
export function useSendCampaignChunk() {
  return useMutation(orpc.newsletter.sendChunk.mutationOptions());
}
export function useRecoverCampaign() {
  return useMutation(orpc.newsletter.recover.mutationOptions());
}
export function useRetryCampaignFailures() {
  return useMutation(orpc.newsletter.retryFailed.mutationOptions());
}
export function useExportNewsletter() {
  return useMutation(orpc.newsletter.exportSubscribers.mutationOptions());
}
export function useRemoveNewsletterSubscriber() {
  const qc = useQueryClient();
  return useMutation(orpc.newsletter.unsubscribeSubscriber.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: orpc.newsletter.key() }) }));
}