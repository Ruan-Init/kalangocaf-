import { beforeEach, expect, test } from "bun:test";
import { call } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import app from "../src/api/index";
import { db } from "../src/api/database";
import * as schema from "../src/api/database/schema";
import { club } from "../src/api/routes/club";
import { _resetSellerCache } from "../src/api/services/mercadopago";
import { buildManifest, signManifest } from "../src/api/services/mercadopago-signature";
import { mock, otherHosts, resetMock } from "./mp-mock";

const ctx = { context: { headers: new Headers() } };
const SECRET = "segredo-de-teste";
const sent: { payload: Record<string, unknown>; key: string }[] = [];

otherHosts.set("api.resend.com", async (_url, init) => {
  sent.push({
    payload: JSON.parse(String(init?.body)) as Record<string, unknown>,
    key: new Headers(init?.headers).get("Idempotency-Key") ?? "",
  });
  return Response.json({ id: `club-email-${sent.length}` });
});

function signup(
  overrides: Partial<Parameters<(typeof club.create)["~orpc"]["handler"]>[0]["input"]> = {},
) {
  return {
    idempotencyKey: "k".repeat(43),
    plan: "duo" as const,
    name: "Pessoa Assinante",
    email: "pessoa@example.com",
    phone: "61999999999",
    document: "12345678909",
    zip: "71503503",
    street: "Rua Teste",
    number: "12",
    district: "Centro",
    city: "Brasília",
    state: "DF",
    ...overrides,
  };
}

async function webhook(paymentId: string) {
  return webhookTopic(paymentId, "payment");
}

async function webhookTopic(resourceId: string, topic: string) {
  const requestId = `club-test-${resourceId}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = signManifest(buildManifest(resourceId, requestId, ts), SECRET);
  return app.request(`/api/webhooks/mercadopago?data.id=${resourceId}&type=${topic}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-signature": `ts=${ts},v1=${signature}`,
    },
    body: JSON.stringify({
      type: topic,
      action: topic === "payment" ? "payment.updated" : "subscription_preapproval.updated",
      live_mode: false,
      data: { id: resourceId },
    }),
  });
}

beforeEach(async () => {
  await db.run(sql.raw("DELETE FROM club_subscription_payments"));
  await db.run(sql.raw("DELETE FROM club_subscriptions"));
  await db.run(sql.raw("DELETE FROM newsletter_subscribers"));
  resetMock();
  _resetSellerCache();
  sent.length = 0;
  process.env.RESEND_API_KEY = "re_fake_key_never_real";
  process.env.EMAIL_FROM = "Kalango <mail@example.test>";
});

test("gera Pix do plano no valor do servidor e envia o código por e-mail", async () => {
  const result = await call(club.create, signup(), ctx);
  expect(result.amountCents).toBe(14900);
  expect(result.pixCode).toStartWith("pix-copia-cola-");
  expect(result.emailSent).toBe(true);
  expect(mock.pixPayments).toHaveLength(1);
  const request = mock.pixPaymentRequests[0] as {
    payment_method_id: string;
    transaction_amount: number;
    payer: { identification: { number: string } };
  };
  expect(request.payment_method_id).toBe("pix");
  expect(request.transaction_amount).toBe(149);
  expect(request.payer.identification.number).toBe("12345678909");
  expect(sent).toHaveLength(1);
  expect(sent[0].key).toBe(`club-pix/${result.reference}`);
  expect(JSON.stringify(sent[0].payload)).toContain(result.pixCode);
  expect(await db.select().from(schema.newsletterSubscribers)).toHaveLength(0);
});

test("inscreve na lista de marketing apenas com opt-in e mantém a inscrição única", async () => {
  const input = signup({ newsletterOptIn: true });
  await call(club.create, input, ctx);
  await call(club.create, input, ctx);
  const subscribers = await db.select().from(schema.newsletterSubscribers);
  expect(subscribers).toHaveLength(1);
  expect(subscribers[0].email).toBe("pessoa@example.com");
  expect(subscribers[0].source).toBe("clube");
});

test("repete uma tentativa sem criar novo Pix e recusa reutilizar a chave com dados diferentes", async () => {
  const input = signup();
  const first = await call(club.create, input, ctx);
  const repeated = await call(club.create, input, ctx);
  expect(repeated.reference).toBe(first.reference);
  expect(mock.pixPayments).toHaveLength(1);
  await expect(call(club.create, { ...input, plan: "descoberta" }, ctx)).rejects.toThrow(
    "outros dados",
  );
});

test("recusa CPF inválido antes de criar a cobrança", async () => {
  await expect(call(club.create, signup({ document: "11111111111" }), ctx)).rejects.toThrow("CPF");
  expect(mock.pixPayments).toHaveLength(0);
});

test("webhook só ativa a assinatura depois de confirmar valor e pagamento", async () => {
  const result = await call(club.create, signup(), ctx);
  const subscription = (
    await db
      .select()
      .from(schema.clubSubscriptions)
      .where(eq(schema.clubSubscriptions.reference, result.reference))
  )[0];
  expect(subscription).not.toHaveProperty("document");
  const paymentId = subscription.mpPaymentId!;
  const pending = mock.payments.get(paymentId)!;
  mock.payments.set(paymentId, {
    ...pending,
    status: "approved",
    date_approved: new Date().toISOString(),
  });

  const response = await webhook(paymentId);
  expect(response.status).toBe(200);
  const active = (
    await db
      .select()
      .from(schema.clubSubscriptions)
      .where(eq(schema.clubSubscriptions.reference, result.reference))
  )[0];
  expect(active.status).toBe("active");
  expect(active.paymentStatus).toBe("approved");
  expect(active.paidAt).toBeInstanceOf(Date);
  expect(sent).toHaveLength(3);
  expect(sent[1].payload.subject).toContain("Bem-vindo ao Clube Kalango");
  expect((await db.select().from(schema.newsletterSubscribers))).toHaveLength(0);
  await webhook(paymentId);
  expect(sent).toHaveLength(3);
});

test("cartão cria checkout recorrente no Mercado Pago e exige consentimento", async () => {
  await expect(call(club.create, signup({ paymentMethod: "card" }), ctx)).rejects.toThrow("Input validation failed");
  expect(mock.preapprovalRequests).toHaveLength(0);

  const result = await call(club.create, signup({ paymentMethod: "card", cardConsent: true }), ctx);
  expect(result.paymentMethod).toBe("card");
  expect(result.checkoutUrl).toStartWith("https://www.mercadopago.com.br/");
  expect(mock.preapprovalRequests).toHaveLength(1);
  const request = mock.preapprovalRequests[0] as {
    status: string;
    external_reference: string;
    auto_recurring: { frequency: number; frequency_type: string; transaction_amount: number; currency_id: string };
  };
  expect(request.status).toBe("pending");
  expect(request.external_reference).toBe(result.reference);
  expect(request.auto_recurring).toEqual({
    frequency: 1,
    frequency_type: "months",
    transaction_amount: 149,
    currency_id: "BRL",
  });
  expect(JSON.stringify(request)).not.toContain("12345678909");
});

test("webhook confirma cartão, envia boas-vindas pela newsletter uma vez e não inscreve em marketing", async () => {
  const result = await call(club.create, signup({ paymentMethod: "card", cardConsent: true }), ctx);
  const subscription = (
    await db.select().from(schema.clubSubscriptions)
      .where(eq(schema.clubSubscriptions.reference, result.reference))
  )[0];
  const preapprovalId = subscription.mpPreapprovalId!;
  const preapproval = mock.preapprovals.get(preapprovalId)!;
  mock.preapprovals.set(preapprovalId, { ...preapproval, status: "authorized" });
  expect((await webhookTopic(preapprovalId, "subscription_preapproval")).status).toBe(200);

  const firstPaymentId = "91001";
  mock.payments.set(firstPaymentId, {
    id: Number(firstPaymentId),
    status: "approved",
    status_detail: "accredited",
    external_reference: result.reference,
    transaction_amount: 149,
    currency_id: "BRL",
    collector_id: 999,
    live_mode: false,
    payment_type_id: "credit_card",
    payment_method_id: "visa",
    date_approved: new Date().toISOString(),
  });
  const firstAuthorizedId = "auth-first";
  mock.authorizedPayments.set(firstAuthorizedId, {
    id: firstAuthorizedId,
    preapproval_id: preapprovalId,
    payment: { id: Number(firstPaymentId) },
  });
  expect((await webhookTopic(firstAuthorizedId, "subscription_authorized_payment")).status).toBe(200);
  expect(sent).toHaveLength(2);
  expect(sent[0].payload.subject).toContain("Bem-vindo ao Clube Kalango");
  expect(sent[0].key).toBe(`club-welcome/${result.reference}`);
  expect((await db.select().from(schema.newsletterSubscribers))).toHaveLength(0);
  await webhookTopic(firstAuthorizedId, "subscription_authorized_payment");
  expect(sent).toHaveLength(2);

  const renewalId = "91002";
  mock.payments.set(renewalId, {
    id: Number(renewalId),
    status: "approved",
    status_detail: "accredited",
    external_reference: result.reference,
    transaction_amount: 149,
    currency_id: "BRL",
    collector_id: 999,
    live_mode: false,
    payment_type_id: "credit_card",
    payment_method_id: "visa",
    date_approved: new Date().toISOString(),
  });
  const renewalAuthorizedId = "auth-renewal";
  mock.authorizedPayments.set(renewalAuthorizedId, {
    id: renewalAuthorizedId,
    preapproval_id: preapprovalId,
    payment: { id: Number(renewalId) },
  });
  await webhookTopic(renewalAuthorizedId, "subscription_authorized_payment");
  expect(sent).toHaveLength(3);
  expect(sent.filter((message) => message.key === `club-welcome/${result.reference}`)).toHaveLength(1);
});

test("webhook não ativa a assinatura quando o valor diverge", async () => {
  const result = await call(club.create, signup(), ctx);
  const subscription = (
    await db
      .select()
      .from(schema.clubSubscriptions)
      .where(eq(schema.clubSubscriptions.reference, result.reference))
  )[0];
  const paymentId = subscription.mpPaymentId!;
  const pending = mock.payments.get(paymentId)!;
  mock.payments.set(paymentId, {
    ...pending,
    status: "approved",
    transaction_amount: 1,
  });

  const response = await webhook(paymentId);
  expect(response.status).toBe(200);
  const unchanged = (
    await db
      .select()
      .from(schema.clubSubscriptions)
      .where(eq(schema.clubSubscriptions.reference, result.reference))
  )[0];
  expect(unchanged.status).toBe("pending_payment");
  expect(unchanged.paidAt).toBeNull();
});
