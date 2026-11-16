/**
 * Ligação entre pedidos e pagamentos do Mercado Pago.
 *
 * Uma única função (`applyPayment`) decide o efeito de um pagamento no pedido —
 * usada pelo webhook e pela conciliação do retorno do checkout. Ela só recebe
 * pagamentos buscados na API (nunca o corpo da notificação nem a URL de retorno).
 *
 * Regras:
 * - Só `approved` (vindo da API) marca o pedido como pago.
 * - Situação do pagamento (paymentStatus) é separada do andamento (status).
 * - Pedido pago nunca volta para pendente; eventos repetidos não repetem efeitos.
 * - Estorno/contestação do pagamento que pagou o pedido ficam registrados em
 *   paymentStatus, sem mexer sozinhos na torra/envio.
 */
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { queueOrderPush } from "./bling-orders";
import { queueOrderEmails } from "./order-email";
import {
  assertSeller,
  assertOrderEnvironment,
  checkPaymentMatchesOrder,
  createPreference,
  getPayment,
  isAllowedCheckoutUrl,
  MercadoPagoError,
  mpEnv,
  searchPaymentsByReference,
  type MpPayment,
} from "./mercadopago";

type Order = schema.Order;

const PENDING_LIKE = new Set(["pending", "in_process", "authorized"]);
const AFTER_PAID = new Set(["refunded", "charged_back", "cancelled", "in_mediation"]);
const KNOWN = new Set([
  "pending",
  "in_process",
  "authorized",
  "approved",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
  "in_mediation",
]);

export type ApplyOutcome =
  | "processed"
  | "paid"
  | "duplicate"
  | "ignored_unknown_order"
  | "ignored_mismatch_seller"
  | "ignored_mismatch_currency"
  | "ignored_mismatch_amount"
  | "ignored_mismatch_reference"
  | "ignored_mismatch_environment"
  | "ignored_other_payment"
  | "ignored_regression"
  | "ignored_unknown_status";

async function findOrder(reference: string) {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.reference, reference))
    .limit(1);
  return order ?? null;
}

export async function orderItems(orderId: number) {
  return db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
}

async function notifyPaid(order: Order) {
  await queueOrderEmails(order);
}

/** Aplica ao pedido um pagamento já buscado na API. Idempotente. */
export async function applyPayment(
  payment: MpPayment,
  sellerId: string
): Promise<{ outcome: ApplyOutcome; reference: string | null }> {
  const reference = payment.external_reference ?? "";
  const order = reference ? await findOrder(reference) : null;
  if (!order) return { outcome: "ignored_unknown_order", reference: reference || null };

  const check = checkPaymentMatchesOrder(payment, order, sellerId);
  if (!check.ok) return { outcome: `ignored_mismatch_${check.reason}`, reference };

  const status = payment.status;
  if (!KNOWN.has(status)) return { outcome: "ignored_unknown_status", reference };

  const paymentId = String(payment.id);
  const detail = payment.status_detail ?? null;
  const alreadyPaid = order.paidAt != null;

  if (alreadyPaid) {
    if (order.mpPaymentId !== paymentId) return { outcome: "ignored_other_payment", reference };
    if (status === "approved") {
      if (order.paymentStatus === "approved") {
        // Recupera aviso ainda não enfileirado se o processo caiu após gravar o pago.
        await notifyPaid(order);
        return { outcome: "duplicate", reference };
      }
      // Ex.: contestação resolvida a favor do vendedor volta a approved.
    } else if (!AFTER_PAID.has(status)) {
      return { outcome: "ignored_regression", reference };
    }
    if (order.paymentStatus === status && order.paymentStatusDetail === detail) {
      return { outcome: "duplicate", reference };
    }
    await db
      .update(schema.orders)
      .set({ paymentStatus: status, paymentStatusDetail: detail, paymentError: null })
      .where(eq(schema.orders.id, order.id));
    return { outcome: "processed", reference };
  }

  if (status === "approved") {
    // Update condicional: só um processo "ganha" a transição para pago.
    const won = await db
      .update(schema.orders)
      .set({
        paymentStatus: "approved",
        paymentStatusDetail: detail,
        paymentError: null,
        mpPaymentId: paymentId,
        paymentIntentId: paymentId,
        paidAt: new Date(),
        status: order.status === "pending_payment" ? "paid" : order.status,
      })
      .where(and(eq(schema.orders.id, order.id), isNull(schema.orders.paidAt)))
      .returning();
    if (won.length === 0) return { outcome: "duplicate", reference };
    try {
      await notifyPaid(won[0]);
    } catch (err) {
      console.error("[mercadopago] aviso de pagamento falhou:", (err as Error).message);
    }
    // Pedido de venda no Bling (só pedido real; roda em segundo plano).
    queueOrderPush(won[0]);
    return { outcome: "paid", reference };
  }

  // Não pago ainda. Um pagamento antigo recusado não apaga uma tentativa nova em andamento.
  if (
    order.mpPaymentId &&
    order.mpPaymentId !== paymentId &&
    PENDING_LIKE.has(order.paymentStatus ?? "") &&
    !PENDING_LIKE.has(status)
  ) {
    return { outcome: "ignored_other_payment", reference };
  }
  if (
    order.mpPaymentId === paymentId &&
    order.paymentStatus === status &&
    order.paymentStatusDetail === detail
  ) {
    return { outcome: "duplicate", reference };
  }
  await db
    .update(schema.orders)
    .set({ paymentStatus: status, paymentStatusDetail: detail, mpPaymentId: paymentId })
    .where(and(eq(schema.orders.id, order.id), isNull(schema.orders.paidAt)));
  return { outcome: "processed", reference };
}

/**
 * Busca na API os pagamentos do pedido e aplica. Usado no retorno do checkout
 * (quando o webhook atrasa ou não chega — caso normal com credenciais de teste).
 */
export async function reconcileOrder(order: Order, hintPaymentId?: string | null) {
  assertOrderEnvironment(order);
  const seller = await assertSeller();
  const found = new Map<string, MpPayment>();
  if (hintPaymentId) {
    const p = await getPayment(hintPaymentId);
    if (p && p.external_reference === order.reference) found.set(String(p.id), p);
  }
  for (const p of await searchPaymentsByReference(order.reference)) found.set(String(p.id), p);

  // Mais antigos primeiro: o estado final reflete a tentativa mais recente,
  // e um aprovado em qualquer ponto prende o pedido como pago.
  const list = [...found.values()]
    .sort((a, b) => (a.date_created ?? "").localeCompare(b.date_created ?? ""))
    .slice(-10);
  const outcomes: ApplyOutcome[] = [];
  for (const p of list) outcomes.push((await applyPayment(p, seller.id)).outcome);

  await db
    .update(schema.orders)
    .set({ paymentCheckedAt: new Date() })
    .where(eq(schema.orders.id, order.id));
  return outcomes;
}

/**
 * Garante uma preference válida para um pedido ainda não pago. Reaproveita a
 * existente; se a criação falhar, o pedido fica com erro legível e pode ser
 * retomado. A chave enviada é estável por pedido/ambiente; chamadas simultâneas
 * neste processo compartilham a mesma tentativa. Não depende de UUID por retry.
 */
async function preparePreference(order: Order, accessToken: string) {
  assertOrderEnvironment(order);
  if (order.paidAt) return { checkoutUrl: null, error: null, alreadyPaid: true };
  await assertSeller();
  if (order.mpPreferenceId && isAllowedCheckoutUrl(order.mpCheckoutUrl)) {
    return { checkoutUrl: order.mpCheckoutUrl, error: null, alreadyPaid: false };
  }
  const items = await orderItems(order.id);
  try {
    const pref = await createPreference({
      reference: order.reference,
      accessToken,
      lines: items.map((i) => ({
        id: `p${i.productId ?? i.id}`,
        title: `${i.name} — ${i.grind}`,
        quantity: i.quantity,
        unitCents: i.unitCents,
      })),
      shippingCents: order.shippingCents,
      shippingLabel: order.shippingMethod,
      payer: { name: order.customerName, email: order.email },
      idempotencyKey: createHash("sha256")
        .update(`kalango-preference:${mpEnv()}:${order.reference}`).digest("hex"),
    });
    await db
      .update(schema.orders)
      .set({
        mpPreferenceId: pref.preferenceId,
        mpCheckoutUrl: pref.checkoutUrl,
        paymentStatus: order.paymentStatus === "preference_error" || !order.paymentStatus
          ? "awaiting"
          : order.paymentStatus,
        paymentError: null,
      })
      .where(eq(schema.orders.id, order.id));
    return { checkoutUrl: pref.checkoutUrl, error: null, alreadyPaid: false };
  } catch (err) {
    const message =
      err instanceof MercadoPagoError ? err.message : "Erro inesperado ao criar o pagamento";
    console.error(`[mercadopago] preference do pedido ${order.reference} falhou: ${message}`);
    await db
      .update(schema.orders)
      .set({ paymentStatus: "preference_error", paymentError: message.slice(0, 300) })
      .where(and(eq(schema.orders.id, order.id), isNull(schema.orders.paidAt)));
    return {
      checkoutUrl: null,
      error: "Não conseguimos abrir o pagamento agora. Seu pedido está salvo — tente de novo em instantes.",
      alreadyPaid: false,
    };
  }
}

const preferenceAttempts = new Map<string, ReturnType<typeof preparePreference>>();

/** Evita criação concorrente no mesmo servidor e relê o link já persistido. */
export async function ensurePreference(order: Order, accessToken: string) {
  assertOrderEnvironment(order);
  const key = `${mpEnv()}:${order.reference}`;
  const existing = preferenceAttempts.get(key);
  if (existing) return existing;
  const attempt = (async () => {
    const current = await findOrder(order.reference);
    if (!current) throw new MercadoPagoError("Pedido não encontrado", { retryable: false });
    return preparePreference(current, accessToken);
  })();
  preferenceAttempts.set(key, attempt);
  try {
    return await attempt;
  } finally {
    if (preferenceAttempts.get(key) === attempt) preferenceAttempts.delete(key);
  }
}
