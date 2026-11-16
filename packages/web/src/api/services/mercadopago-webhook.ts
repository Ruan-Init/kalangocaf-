/**
 * POST /api/webhooks/mercadopago — notificações "Pagamentos" do Mercado Pago.
 *
 * Fluxo: assinatura válida → ID do corpo igual ao da URL → busca o pagamento na
 * API → applyPayment. O corpo da notificação nunca define status nem valor.
 *
 * Respostas:
 * - 401: assinatura ausente/inválida (não processa nada).
 * - 400: requisição malformada ou ID divergente.
 * - 200: processado, repetido ou ignorado de forma definitiva (ex.: simulador
 *   com pagamento inexistente, pedido desconhecido, valor divergente).
 * - 500/503: falha transitória (API/banco) — o Mercado Pago tenta de novo.
 */
import type { Context } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import {
  assertSeller,
  getAuthorizedPayment,
  getPayment,
  getPreapproval,
  MercadoPagoError,
} from "./mercadopago";
import { verifyWebhookSignature } from "./mercadopago-signature";
import { applyPayment } from "./order-payments";
import { applyClubPayment, applyClubPreapproval } from "./club-payments";

const MAX_BODY_BYTES = 64 * 1024;

type Body = {
  type?: string;
  topic?: string;
  action?: string;
  live_mode?: boolean;
  data?: { id?: string | number };
};

async function record(event: {
  requestId: string | null;
  topic: string | null;
  action: string | null;
  resourceId: string | null;
  liveMode: boolean | null;
  outcome: string;
  orderReference?: string | null;
}) {
  try {
    await db.insert(schema.paymentEvents).values({
      requestId: event.requestId?.slice(0, 100) ?? null,
      topic: event.topic?.slice(0, 50) ?? null,
      action: event.action?.slice(0, 80) ?? null,
      resourceId: event.resourceId?.slice(0, 40) ?? null,
      liveMode: event.liveMode,
      outcome: event.outcome,
      orderReference: event.orderReference ?? null,
    });
  } catch (err) {
    console.error("[mercadopago:webhook] não gravou o evento:", (err as Error).message);
  }
}

export async function mercadoPagoWebhook(c: Context) {
  const url = new URL(c.req.url);
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const topicQs = url.searchParams.get("type") ?? url.searchParams.get("topic");
  const requestId = c.req.header("x-request-id") ?? null;

  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return c.json({ error: "payload_too_large" }, 413);
  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) return c.json({ error: "payload_too_large" }, 413);

  if (!dataId) return c.json({ error: "missing_data_id" }, 400);

  const sig = verifyWebhookSignature({
    xSignature: c.req.header("x-signature"),
    xRequestId: requestId,
    dataId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!sig.ok) {
    if (sig.reason === "missing_secret") {
      console.error("[mercadopago:webhook] MERCADOPAGO_WEBHOOK_SECRET ausente");
      return c.json({ error: "not_configured" }, 503);
    }
    // Não grava no banco: requisição não autenticada não pode encher a tabela.
    console.warn(`[mercadopago:webhook] assinatura recusada (${sig.reason})`);
    return c.json({ error: "invalid_signature" }, 401);
  }

  let body: Body = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as Body;
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
  }
  const bodyId = body.data?.id;
  if (bodyId !== undefined && String(bodyId) !== dataId) {
    await record({
      requestId,
      topic: body.type ?? topicQs,
      action: body.action ?? null,
      resourceId: dataId,
      liveMode: body.live_mode ?? null,
      outcome: "rejected_id_mismatch",
    });
    return c.json({ error: "id_mismatch" }, 400);
  }

  const topic = body.type ?? body.topic ?? topicQs ?? null;
  const base = {
    requestId,
    topic,
    action: body.action ?? null,
    resourceId: dataId,
    liveMode: body.live_mode ?? null,
  };

  if (
    topic !== "payment" &&
    topic !== "subscription_preapproval" &&
    topic !== "subscription_authorized_payment"
  ) {
    await record({ ...base, outcome: "ignored_topic" });
    return c.json({ received: true, ignored: "topic" }, 200);
  }

  try {
    const seller = await assertSeller();
    if (topic === "subscription_preapproval") {
      const preapproval = await getPreapproval(dataId);
      if (!preapproval) {
        await record({ ...base, outcome: "ignored_preapproval_not_found" });
        return c.json({ received: true, ignored: "preapproval_not_found" }, 200);
      }
      const result = await applyClubPreapproval(preapproval, seller.id);
      await record({ ...base, outcome: result.outcome, orderReference: result.reference });
      return c.json({ received: true, outcome: result.outcome }, 200);
    }

    if (topic === "subscription_authorized_payment") {
      const authorized = await getAuthorizedPayment(dataId);
      if (!authorized?.preapproval_id || !authorized.payment?.id) {
        await record({ ...base, outcome: "ignored_authorized_payment_incomplete" });
        return c.json({ received: true, ignored: "authorized_payment_incomplete" }, 200);
      }
      const preapproval = await getPreapproval(authorized.preapproval_id);
      if (!preapproval) {
        await record({ ...base, outcome: "ignored_preapproval_not_found" });
        return c.json({ received: true, ignored: "preapproval_not_found" }, 200);
      }
      const subscriptionResult = await applyClubPreapproval(preapproval, seller.id);
      if (subscriptionResult.outcome !== "processed") {
        await record({
          ...base,
          outcome: subscriptionResult.outcome,
          orderReference: subscriptionResult.reference,
        });
        return c.json({ received: true, outcome: subscriptionResult.outcome }, 200);
      }
      const payment = await getPayment(String(authorized.payment.id));
      if (!payment) {
        await record({ ...base, outcome: "ignored_payment_not_found" });
        return c.json({ received: true, ignored: "payment_not_found" }, 200);
      }
      if (
        payment.external_reference &&
        String(payment.external_reference) !== String(preapproval.external_reference)
      ) {
        await record({ ...base, outcome: "ignored_mismatch_reference" });
        return c.json({ received: true, outcome: "ignored_mismatch_reference" }, 200);
      }
      const result = await applyClubPayment({
        ...payment,
        external_reference: payment.external_reference ?? String(preapproval.external_reference ?? ""),
      }, seller.id);
      await record({ ...base, outcome: result.outcome, orderReference: result.reference });
      return c.json({ received: true, outcome: result.outcome }, 200);
    }

    const payment = await getPayment(dataId);
    if (!payment) {
      // Típico do "Simular notificação": ID que não existe. Autenticado, mas nada a fazer.
      await record({ ...base, outcome: "ignored_payment_not_found" });
      return c.json({ received: true, ignored: "payment_not_found" }, 200);
    }
    const orderResult = await applyPayment(payment, seller.id);
    const result = orderResult.outcome === "ignored_unknown_order"
      ? await applyClubPayment(payment, seller.id)
      : orderResult;
    await record({ ...base, outcome: result.outcome, orderReference: result.reference });
    return c.json({ received: true, outcome: result.outcome }, 200);
  } catch (err) {
    const retryable = !(err instanceof MercadoPagoError) || err.retryable;
    const message = err instanceof Error ? err.message : "erro";
    console.error(`[mercadopago:webhook] falha ao processar ${dataId}: ${message}`);
    await record({ ...base, outcome: retryable ? "error_retryable" : "error_config" });
    // Sempre não-2xx: o Mercado Pago reenviará quando a falha for corrigida.
    return c.json({ error: "processing_failed" }, retryable ? 500 : 503);
  }
}
