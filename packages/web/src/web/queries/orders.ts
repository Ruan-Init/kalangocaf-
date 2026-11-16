import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export type Grind = "Grãos" | "Espresso" | "Coado" | "Prensa francesa" | "Italiana";
type QuoteItem = { slug: string; grind: Grind; quantity: number };

/** Ambiente do pagamento (teste/produção/desativado) e limite de parcelas. */
export function usePaymentConfig() {
  return useQuery(orpc.orders.paymentConfig.queryOptions({ staleTime: 10 * 60_000 }));
}

/** Cotação de frete: recota quando o CEP fica válido ou o carrinho muda. */
export function useShippingOptions(zip: string, items: QuoteItem[]) {
  return useQuery(
    orpc.orders.shippingOptions.queryOptions({
      input: { zip, items },
      staleTime: 5 * 60_000,
    })
  );
}

export function useQuote(items: QuoteItem[], zip: string, shippingServiceId: string) {
  return useQuery(
    orpc.orders.quote.queryOptions({
      input: { items, zip, shippingServiceId },
      enabled: items.length > 0,
    })
  );
}

export function useCreateOrder() {
  return useMutation(orpc.orders.create.mutationOptions());
}

const ACTIVE = new Set(["awaiting", "pending", "in_process", "authorized", null]);

/**
 * Pedido + situação do pagamento conferida no Mercado Pago pelo servidor.
 * Atualiza a cada 5s só enquanto `polling` for true e o pagamento estiver em
 * aberto — a página limita esse período.
 */
export function useOrderStatus(
  reference: string,
  token: string | null,
  paymentId: string | undefined,
  polling: boolean
) {
  return useQuery(
    orpc.orders.syncPayment.queryOptions({
      input: { reference, token: token ?? "", paymentId },
      enabled: Boolean(reference && token),
      retry: false,
      refetchOnWindowFocus: false,
      refetchInterval: (q) => {
        const d = q.state.data;
        if (!polling || !d || d.paid || !d.canPay) return false;
        return ACTIVE.has(d.paymentStatus) ? 5_000 : false;
      },
    })
  );
}

export function useResumePayment() {
  return useMutation(orpc.orders.resumePayment.mutationOptions());
}
