import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mock, payment, resetMock } from "./mp-mock";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import app from "../src/api/index";
import { orders } from "../src/api/routes/orders";
import { admin } from "../src/api/routes/admin";
import { db } from "../src/api/database";
import * as schema from "../src/api/database/schema";
import { _resetSellerCache } from "../src/api/services/mercadopago";
import { buildManifest, signManifest } from "../src/api/services/mercadopago-signature";

const ctx = { context: { headers: new Headers() } };
const SECRET = "segredo-de-teste";
let keySeq = 0;
const newKey = () => `chave-de-teste-${Date.now()}-${++keySeq}-${"x".repeat(20)}`;

function checkout(overrides: Partial<Parameters<typeof orders.create["~orpc"]["handler"]>[0]["input"]> = {}) {
  return {
    idempotencyKey: newKey(),
    customerName: "Comprador Teste",
    email: "comprador@example.com",
    phone: "61999999999",
    document: "12345678909",
    zip: "71503503",
    street: "Rua Teste",
    number: "1",
    district: "Centro",
    city: "Brasília",
    state: "DF",
    shippingServiceId: "pac",
    items: [{ slug: "cafe-a", grind: "Grãos" as const, quantity: 2 }],
    ...overrides,
  };
}

async function webhook(dataId: string, opts: { sign?: boolean; bodyId?: string; requestId?: string } = {}) {
  const requestId = opts.requestId ?? `req-${Math.random()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": requestId };
  if (opts.sign !== false) {
    headers["x-signature"] = `ts=${ts},v1=${signManifest(buildManifest(dataId, requestId, ts), SECRET)}`;
  }
  return app.request(`/api/webhooks/mercadopago?data.id=${dataId}&type=payment`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "payment", action: "payment.updated", live_mode: false, data: { id: opts.bodyId ?? dataId } }),
  });
}

async function row(reference: string) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.reference, reference));
  return o;
}

let payId = 5000;

beforeAll(async () => {
  await db.insert(schema.products).values([
    { slug: "cafe-a", name: "Café A", priceCents: 9500, stock: 5, weightGrams: 250 },
    { slug: "cafe-b", name: "Café B", priceCents: 6990, stock: 50, weightGrams: 250 },
  ]);
  process.env.OPS_TOKEN = "ops-teste";
});

beforeEach(() => {
  resetMock();
  _resetSellerCache();
});

describe("criação do pedido", () => {
  test("cria pedido de teste, preference com total exato e link do Mercado Pago", async () => {
    const res = await call(orders.create, checkout(), ctx);
    expect(res.checkoutUrl).toStartWith("https://www.mercadopago.com.br/");
    expect(res.accessToken.length).toBeGreaterThan(30);
    const o = await row(res.reference);
    expect(o.isTest).toBe(true);
    expect(o.status).toBe("pending_payment");
    expect(o.paymentStatus).toBe("awaiting");
    expect(o.accessTokenHash).not.toBe(res.accessToken);
    expect(o.mpPreferenceId).toBe("pref-1");
    const pref = mock.preferences[0] as { items: { unit_price: number; quantity: number }[]; external_reference: string };
    const total = pref.items.reduce((s, i) => s + Math.round(i.unit_price * 100) * i.quantity, 0);
    expect(total).toBe(o.totalCents);
    expect(o.totalCents).toBe(2 * 9500 + o.shippingCents);
    expect(pref.external_reference).toBe(res.reference);
  });

  test("duplo envio com a mesma chave devolve o mesmo pedido", async () => {
    const input = checkout();
    const [a, b] = await Promise.all([call(orders.create, input, ctx), call(orders.create, input, ctx)]);
    const c = await call(orders.create, input, ctx);
    expect(a.reference).toBe(b.reference);
    expect(c.reference).toBe(a.reference);
    expect(c.accessToken).toBe(a.accessToken);
    const rows = await db.select().from(schema.orders).where(eq(schema.orders.reference, a.reference));
    expect(rows).toHaveLength(1);
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, rows[0].id));
    expect(items).toHaveLength(1);
  });

  test("mesma chave com carrinho diferente é recusada", async () => {
    const input = checkout();
    await call(orders.create, input, ctx);
    await expect(call(orders.create, { ...input, items: [{ slug: "cafe-b", grind: "Grãos", quantity: 1 }] }, ctx)).rejects.toThrow("outro carrinho");
  });

  test("produto desconhecido, quantidade fracionária, moagem inválida e estoque somado são recusados", async () => {
    await expect(call(orders.create, checkout({ items: [{ slug: "nao-existe", grind: "Grãos", quantity: 1 }] }), ctx)).rejects.toThrow("não está mais disponível");
    await expect(call(orders.create, checkout({ items: [{ slug: "cafe-a", grind: "Grãos", quantity: 1.5 }] }), ctx)).rejects.toThrow();
    await expect(call(orders.create, checkout({ items: [{ slug: "cafe-a", grind: "Turca" as "Grãos", quantity: 1 }] }), ctx)).rejects.toThrow();
    await expect(call(orders.create, checkout({ items: [
      { slug: "cafe-a", grind: "Grãos", quantity: 3 },
      { slug: "cafe-a", grind: "Coado", quantity: 3 },
    ] }), ctx)).rejects.toThrow("Estoque insuficiente");
  });

  test("frete inexistente é recusado em vez de trocado em silêncio", async () => {
    await expect(call(orders.create, checkout({ shippingServiceId: "frete-inventado" }), ctx)).rejects.toThrow("frete mudou");
  });

  test("falha na preference deixa o pedido salvo e retomável, sem duplicar", async () => {
    mock.failPreference = 1;
    const input = checkout();
    const first = await call(orders.create, input, ctx);
    expect(first.checkoutUrl).toBeNull();
    expect(first.paymentError).toContain("Seu pedido está salvo");
    expect((await row(first.reference)).paymentStatus).toBe("preference_error");

    const resumed = await call(orders.resumePayment, { reference: first.reference, token: first.accessToken }, ctx);
    expect(resumed.checkoutUrl).toStartWith("https://www.mercadopago.com.br/");
    const again = await call(orders.create, input, ctx);
    expect(again.reference).toBe(first.reference);
    expect(again.checkoutUrl).toBe(resumed.checkoutUrl);
    expect(mock.preferences).toHaveLength(1);
  });

  test("credencial que não é de teste não cria pedido", async () => {
    mock.me = { id: 999, tags: ["normal"] };
    const before = (await db.select().from(schema.orders)).length;
    await expect(call(orders.create, checkout(), ctx)).rejects.toThrow("indisponível");
    expect((await db.select().from(schema.orders)).length).toBe(before);
  });
});

describe("acesso ao pedido", () => {
  test("token errado ou ausente não revela o pedido", async () => {
    const res = await call(orders.create, checkout(), ctx);
    await expect(call(orders.get, { reference: res.reference, token: "x".repeat(43) }, ctx)).rejects.toThrow("não encontrado");
    const ok = await call(orders.get, { reference: res.reference, token: res.accessToken }, ctx);
    expect(ok.reference).toBe(res.reference);
    expect(ok.documentMasked).toBe("•••09");
    expect(JSON.stringify(ok)).not.toContain("12345678909");
    expect(ok.items[0].slug).toBe("cafe-a");
  });
});

describe("webhook e conciliação", () => {
  async function newOrder() {
    const res = await call(orders.create, checkout({ items: [{ slug: "cafe-b", grind: "Coado", quantity: 1 }] }), ctx);
    const o = await row(res.reference);
    return { ...res, order: o };
  }

  test("sem assinatura ou assinatura inválida: 401 e nada muda", async () => {
    const { reference, order } = await newOrder();
    const id = String(++payId);
    mock.payments.set(id, payment({ id: Number(id), external_reference: reference, transaction_amount: order.totalCents / 100 }));
    expect((await webhook(id, { sign: false })).status).toBe(401);
    const bad = await app.request(`/api/webhooks/mercadopago?data.id=${id}&type=payment`, {
      method: "POST",
      headers: { "x-signature": `ts=1,v1=${"a".repeat(64)}`, "x-request-id": "r" },
      body: "{}",
    });
    expect(bad.status).toBe(401);
    expect((await row(reference)).paidAt).toBeNull();
    expect(mock.calls.filter((c) => c.includes("/v1/payments"))).toHaveLength(0);
  });

  test("ID do corpo diferente do ID assinado na URL: 400", async () => {
    const res = await webhook("123", { bodyId: "456" });
    expect(res.status).toBe(400);
  });

  test("aprovado marca pago uma vez; repetição é idempotente", async () => {
    const { reference, order } = await newOrder();
    const id = String(++payId);
    mock.payments.set(id, payment({ id: Number(id), external_reference: reference, transaction_amount: order.totalCents / 100 }));
    const r1 = await webhook(id);
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { outcome: string }).outcome).toBe("paid");
    const paid = await row(reference);
    expect(paid.status).toBe("paid");
    expect(paid.paymentStatus).toBe("approved");
    expect(paid.mpPaymentId).toBe(id);
    const r2 = await webhook(id);
    expect(((await r2.json()) as { outcome: string }).outcome).toBe("duplicate");
    expect((await row(reference)).paidAt?.getTime()).toBe(paid.paidAt?.getTime());
  });

  test("pendente, rejeitado e cancelado não marcam pago", async () => {
    for (const status of ["pending", "in_process", "rejected", "cancelled"]) {
      const { reference, order } = await newOrder();
      const id = String(++payId);
      mock.payments.set(id, payment({ id: Number(id), status, external_reference: reference, transaction_amount: order.totalCents / 100 }));
      expect((await webhook(id)).status).toBe(200);
      const o = await row(reference);
      expect(o.paidAt).toBeNull();
      expect(o.status).toBe("pending_payment");
      expect(o.paymentStatus).toBe(status);
    }
  });

  test("valor, moeda, vendedor ou referência divergentes nunca confirmam", async () => {
    const patches = [
      { transaction_amount: 1 },
      { currency_id: "USD" },
      { collector_id: 12345 },
    ];
    for (const patch of patches) {
      const { reference, order } = await newOrder();
      const id = String(++payId);
      mock.payments.set(id, payment({ id: Number(id), external_reference: reference, transaction_amount: order.totalCents / 100, ...patch }));
      const res = await webhook(id);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { outcome: string }).outcome).toStartWith("ignored_mismatch");
      expect((await row(reference)).paidAt).toBeNull();
    }
  });

  test("pago não volta a pendente; estorno é registrado sem mexer no andamento", async () => {
    const { reference, order } = await newOrder();
    const id = String(++payId);
    const amount = order.totalCents / 100;
    mock.payments.set(id, payment({ id: Number(id), external_reference: reference, transaction_amount: amount }));
    await webhook(id);
    // Evento atrasado com status antigo (API devolveria pending só num cenário anômalo).
    mock.payments.set(id, payment({ id: Number(id), status: "pending", external_reference: reference, transaction_amount: amount }));
    expect(((await (await webhook(id)).json()) as { outcome: string }).outcome).toBe("ignored_regression");
    expect((await row(reference)).paymentStatus).toBe("approved");
    // Outra tentativa recusada do mesmo pedido não mexe no pago.
    const other = String(++payId);
    mock.payments.set(other, payment({ id: Number(other), status: "rejected", external_reference: reference, transaction_amount: amount }));
    expect(((await (await webhook(other)).json()) as { outcome: string }).outcome).toBe("ignored_other_payment");
    // Estorno do pagamento que pagou.
    mock.payments.set(id, payment({ id: Number(id), status: "refunded", external_reference: reference, transaction_amount: amount }));
    await webhook(id);
    const o = await row(reference);
    expect(o.paymentStatus).toBe("refunded");
    expect(o.status).toBe("paid");
    expect(o.paidAt).not.toBeNull();
  });

  test("simulador com pagamento inexistente: 200 ignorado, nada é forjado", async () => {
    const res = await webhook("123456");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ignored: string }).ignored).toBe("payment_not_found");
    const [ev] = await db.select().from(schema.paymentEvents).where(eq(schema.paymentEvents.resourceId, "123456"));
    expect(ev.outcome).toBe("ignored_payment_not_found");
  });

  test("falha transitória da API devolve 500 para o Mercado Pago tentar de novo", async () => {
    mock.failPayments = true;
    const res = await webhook(String(++payId));
    expect(res.status).toBe(500);
  });

  test("retorno do checkout concilia pela API; parâmetros da URL não bastam", async () => {
    const { reference, accessToken, order } = await newOrder();
    // Sem pagamento na API, mesmo com payment_id "aprovado" na URL, continua pendente.
    const before = await call(orders.syncPayment, { reference, token: accessToken, paymentId: "999999" }, ctx);
    expect(before.paid).toBe(false);
    const id = String(++payId);
    mock.payments.set(id, payment({ id: Number(id), external_reference: reference, transaction_amount: order.totalCents / 100 }));
    // Limite de consultas: logo em seguida não chama a API de novo.
    const callsBefore = mock.calls.length;
    const throttled = await call(orders.syncPayment, { reference, token: accessToken }, ctx);
    expect(throttled.paid).toBe(false);
    expect(mock.calls.length).toBe(callsBefore);
    await db.update(schema.orders).set({ paymentCheckedAt: new Date(0) }).where(eq(schema.orders.reference, reference));
    const after = await call(orders.syncPayment, { reference, token: accessToken }, ctx);
    expect(after.paid).toBe(true);
    expect(after.status).toBe("paid");
  });
});

describe("gestão", () => {
  test("pedido de teste fica fora dos totais e não entra na operação", async () => {
    const res = await call(orders.create, checkout({ items: [{ slug: "cafe-b", grind: "Grãos", quantity: 1 }] }), ctx);
    const o = await row(res.reference);
    const id = String(++payId);
    mock.payments.set(id, payment({ id: Number(id), external_reference: res.reference, transaction_amount: o.totalCents / 100 }));
    await webhook(id);

    const summary = await call(admin.summary, { token: "ops-teste" }, ctx);
    expect(summary.total).toBe(0);
    expect(summary.faturadoCents).toBe(0);
    expect(summary.aFazer).toBe(0);
    expect(summary.testes).toBeGreaterThan(0);

    await expect(call(admin.setStatus, { token: "ops-teste", reference: res.reference, status: "roasting" }, ctx)).rejects.toThrow("Pedido de teste");
    await expect(call(admin.ship, { token: "ops-teste", reference: res.reference, trackingCode: "AA123456789BR" }, ctx)).rejects.toThrow("Pedido de teste");
    const list = await call(admin.orders, { token: "ops-teste" }, ctx);
    const item = list.find((x) => x.reference === res.reference)!;
    expect(item.isTest).toBe(true);
    expect(JSON.stringify(item)).not.toContain("accessTokenHash");
  });
});

describe("Checkout Pro de produção — API simulada", () => {
  function production() {
    process.env.MERCADOPAGO_ENV = "production";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    mock.me = { id: 999, tags: ["normal"], site_id: "MLB" };
    _resetSellerCache();
  }
  beforeEach(production);
  afterEach(() => {
    process.env.MERCADOPAGO_ENV = "test";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    _resetSellerCache();
  });

  test("configuração incompleta não oferece checkout nem grava pedido", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const before = (await db.select().from(schema.orders)).length;
    expect((await call(orders.paymentConfig, undefined, ctx)).env).toBe("disabled");
    await expect(call(orders.create, checkout(), ctx)).rejects.toThrow("indisponível");
    expect((await db.select().from(schema.orders)).length).toBe(before);
    expect(mock.preferences).toHaveLength(0);
    expect((await webhook("123")).status).toBe(503);
  });

  test("pedido real usa URL oficial; duplo clique compartilha uma preference", async () => {
    expect((await call(orders.paymentConfig, undefined, ctx)).env).toBe("production");
    const input = checkout();
    const [a, b] = await Promise.all([call(orders.create, input, ctx), call(orders.create, input, ctx)]);
    expect(a.reference).toBe(b.reference);
    expect(a.checkoutUrl).toBe(b.checkoutUrl);
    expect(a.checkoutUrl).toStartWith("https://www.mercadopago.com.br/");
    expect((await row(a.reference)).isTest).toBe(false);
    expect(mock.preferences).toHaveLength(1);
    expect((await call(orders.get, { reference: a.reference, token: a.accessToken }, ctx)).canPay).toBe(true);
  });

  test("retry usa a mesma chave enviada ao provedor", async () => {
    mock.failPreference = 1;
    const a = await call(orders.create, checkout(), ctx);
    expect(a.checkoutUrl).toBeNull();
    const b = await call(orders.resumePayment, { reference: a.reference, token: a.accessToken }, ctx);
    expect(b.checkoutUrl).not.toBeNull();
    expect(mock.preferenceKeys).toHaveLength(2);
    expect(mock.preferenceKeys[0]).toBe(mock.preferenceKeys[1]);
    expect(mock.preferenceKeys[0]).toHaveLength(64);
  });

  test("webhook assinado aprova pedido real somente com live_mode vindo da API", async () => {
    const a = await call(orders.create, checkout(), ctx);
    const o = await row(a.reference);
    const id = String(++payId);
    mock.payments.set(id, payment({ id: Number(id), external_reference: a.reference, transaction_amount: o.totalCents / 100 }));
    expect((await (await webhook(id)).json()).outcome).toBe("ignored_mismatch_environment");
    expect((await row(a.reference)).paidAt).toBeNull();
    // Corpo da notificação continua live_mode=false; apenas a API confirma.
    mock.payments.get(id)!.live_mode = true;
    expect((await (await webhook(id)).json()).outcome).toBe("paid");
    expect((await row(a.reference)).status).toBe("paid");
    expect((await (await webhook(id)).json()).outcome).toBe("duplicate");
  });

  test("retorno do checkout concilia pagamento real pela API", async () => {
    const a = await call(orders.create, checkout(), ctx);
    const o = await row(a.reference);
    const id = String(++payId);
    mock.payments.set(id, payment({ id: Number(id), external_reference: a.reference, transaction_amount: o.totalCents / 100, live_mode: true }));
    const r = await call(orders.syncPayment, { reference: a.reference, token: a.accessToken, paymentId: id }, ctx);
    expect(r.paid).toBe(true);
    expect(r.isTest).toBe(false);
    expect(mock.calls.some((c) => c.includes("/v1/payments/search"))).toBe(true);
  });

  test("pedido antigo de teste não pode ser retomado ou aprovado em produção", async () => {
    process.env.MERCADOPAGO_ENV = "test";
    mock.me.tags = ["test_user"];
    _resetSellerCache();
    const input = checkout();
    const a = await call(orders.create, input, ctx);
    production();
    const before = mock.calls.length;
    await expect(call(orders.resumePayment, { reference: a.reference, token: a.accessToken }, ctx)).rejects.toThrow("outro ambiente");
    expect(mock.calls.length).toBe(before);
    await expect(call(orders.create, input, ctx)).rejects.toThrow("outro ambiente");
    expect((await call(orders.get, { reference: a.reference, token: a.accessToken }, ctx)).canPay).toBe(false);
    const o = await row(a.reference);
    const id = String(++payId);
    mock.payments.set(id, payment({ id: Number(id), external_reference: a.reference, transaction_amount: o.totalCents / 100, live_mode: true }));
    expect((await (await webhook(id)).json()).outcome).toBe("ignored_mismatch_environment");
    expect((await row(a.reference)).paidAt).toBeNull();
  });

  test("pedido real também não pode ser retomado no modo teste", async () => {
    const a = await call(orders.create, checkout(), ctx);
    process.env.MERCADOPAGO_ENV = "test";
    mock.me.tags = ["test_user"];
    _resetSellerCache();
    await expect(call(orders.resumePayment, { reference: a.reference, token: a.accessToken }, ctx)).rejects.toThrow("outro ambiente");
    const before = mock.calls.length;
    const r = await call(orders.syncPayment, { reference: a.reference, token: a.accessToken }, ctx);
    expect(r.paid).toBe(false);
    expect(r.canPay).toBe(false);
    expect(mock.calls.length).toBe(before);
  });
});
