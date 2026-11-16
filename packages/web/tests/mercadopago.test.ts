import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mock, payment, resetMock } from "./mp-mock";
import {
  _resetSellerCache,
  assertTestSeller,
  assertSeller,
  createPreference,
  paymentsConfigured,
  buildPreferenceBody,
  checkPaymentMatchesOrder,
  isAllowedCheckoutUrl,
  MAX_INSTALLMENTS,
} from "../src/api/services/mercadopago";
import {
  buildManifest,
  signManifest,
  verifyWebhookSignature,
} from "../src/api/services/mercadopago-signature";

const SECRET = "segredo-de-teste";

describe("assinatura do webhook", () => {
  const ts = "1704908010";
  const sign = (dataId: string, requestId: string) =>
    `ts=${ts},v1=${signManifest(buildManifest(dataId, requestId, ts), SECRET)}`;

  test("manifesto segue o formato documentado", () => {
    expect(buildManifest("123", "req-1", ts)).toBe(`id:123;request-id:req-1;ts:${ts};`);
    expect(buildManifest("ABC9", undefined, ts)).toBe(`id:abc9;ts:${ts};`);
  });

  test("válida passa e preserva o ts", () => {
    const r = verifyWebhookSignature({ xSignature: sign("123", "req-1"), xRequestId: "req-1", dataId: "123", secret: SECRET });
    expect(r).toEqual({ ok: true, ts });
  });

  test("ausente, malformada e errada são recusadas", () => {
    expect(verifyWebhookSignature({ xSignature: null, xRequestId: "r", dataId: "1", secret: SECRET }).ok).toBe(false);
    expect(verifyWebhookSignature({ xSignature: "lixo", xRequestId: "r", dataId: "1", secret: SECRET }).ok).toBe(false);
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${"0".repeat(64)}`, xRequestId: "r", dataId: "1", secret: SECRET }).ok).toBe(false);
  });

  test("assinatura de outro ID ou outro request-id não serve", () => {
    const sig = sign("123", "req-1");
    expect(verifyWebhookSignature({ xSignature: sig, xRequestId: "req-1", dataId: "124", secret: SECRET }).ok).toBe(false);
    expect(verifyWebhookSignature({ xSignature: sig, xRequestId: "req-2", dataId: "123", secret: SECRET }).ok).toBe(false);
    expect(verifyWebhookSignature({ xSignature: sig, xRequestId: "req-1", dataId: "123", secret: "outro" }).ok).toBe(false);
  });

  test("sem segredo configurado nada passa", () => {
    expect(verifyWebhookSignature({ xSignature: sign("1", "r"), xRequestId: "r", dataId: "1", secret: "" })).toEqual({ ok: false, reason: "missing_secret" });
  });
});

describe("produção — configuração, conta e isolamento", () => {
  beforeEach(() => {
    resetMock();
    _resetSellerCache();
    process.env.MERCADOPAGO_ENV = "production";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-fake-production";
    process.env.MERCADOPAGO_SELLER_ID = "999";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    mock.me = { id: 999, tags: ["normal"], site_id: "MLB" };
  });
  afterEach(() => {
    process.env.MERCADOPAGO_ENV = "test";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-fake-test-token";
    process.env.MERCADOPAGO_SELLER_ID = "999";
    process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
    _resetSellerCache();
  });

  test("conta brasileira real esperada passa", async () => {
    expect((await assertSeller()).isTestUser).toBe(false);
    expect(paymentsConfigured()).toBe(true);
  });

  test("sem webhook secret bloqueia antes de qualquer chamada", async () => {
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    expect(paymentsConfigured()).toBe(false);
    await expect(assertSeller()).rejects.toThrow("configuração completa");
    expect(mock.calls).toHaveLength(0);
  });

  test.each([
    { id: 999, tags: ["test_user"], site_id: "MLB" },
    { id: 998, tags: ["normal"], site_id: "MLB" },
    { id: 999, tags: ["normal"], site_id: "MLA" },
  ])("conta divergente é bloqueada: %j", async (me) => {
    mock.me = me;
    await expect(assertSeller()).rejects.toThrow("Credencial bloqueada");
  });

  test("cache não atravessa troca de token ou ambiente e revalida vendedor esperado", async () => {
    await assertSeller();
    await assertSeller();
    expect(mock.calls).toHaveLength(1);
    process.env.MERCADOPAGO_SELLER_ID = "123";
    await expect(assertSeller()).rejects.toThrow("Credencial bloqueada");
    process.env.MERCADOPAGO_SELLER_ID = "999";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-another-fake-token";
    mock.me.tags = ["test_user"];
    await expect(assertSeller()).rejects.toThrow("Credencial bloqueada");
    expect(mock.calls).toHaveLength(2);
    process.env.MERCADOPAGO_ENV = "test";
    await assertSeller();
    expect(mock.calls).toHaveLength(3);
  });

  test("pagamento de produção exige live_mode e pedido real", () => {
    const o = { reference: "KLG-PROD", totalCents: 9500, isTest: false };
    const p = payment({ id: 33, external_reference: o.reference, transaction_amount: 95, live_mode: true });
    expect(checkPaymentMatchesOrder(p, o, "999")).toEqual({ ok: true });
    for (const live_mode of [false, undefined]) {
      expect(checkPaymentMatchesOrder({ ...p, live_mode }, o, "999")).toEqual({ ok: false, reason: "environment" });
    }
    expect(checkPaymentMatchesOrder(p, { ...o, isTest: true }, "999")).toEqual({ ok: false, reason: "environment" });
    process.env.MERCADOPAGO_ENV = "test";
    expect(checkPaymentMatchesOrder({ ...p, live_mode: false }, o, "999")).toEqual({ ok: false, reason: "environment" });
  });

  test("produção não aceita sandbox, portas alternativas ou credenciais na URL", async () => {
    expect(isAllowedCheckoutUrl("https://sandbox.mercadopago.com.br/checkout")).toBe(false);
    expect(isAllowedCheckoutUrl("https://user:pass@www.mercadopago.com.br/checkout")).toBe(false);
    expect(isAllowedCheckoutUrl("https://www.mercadopago.com.br:8443/checkout")).toBe(false);
    mock.preferenceReply = { id: "sandbox-only", sandbox_init_point: "https://sandbox.mercadopago.com.br/checkout" };
    await expect(createPreference({
      reference: "KLG-PROD", accessToken: "fake-order-token", lines: [{ id: "p1", title: "Café", quantity: 1, unitCents: 9500 }],
      shippingCents: 0, shippingLabel: "Retirada", payer: { name: "Teste", email: "teste@example.com" }, idempotencyKey: "fake-key",
    })).rejects.toThrow("sem link válido");
  });
});

describe("preference", () => {
  const body = buildPreferenceBody({
    reference: "KLG-TESTE",
    accessToken: "tok en/+",
    lines: [{ id: "p1", title: "Café — Grãos", quantity: 2, unitCents: 9500 }],
    shippingCents: 2590,
    shippingLabel: "PAC",
    payer: { name: "Fulano", email: "f@example.com" },
    idempotencyKey: "x",
  });

  test("frete entra uma vez e o total bate em centavos", () => {
    const total = body.items.reduce((s, i) => s + Math.round(i.unit_price * 100) * i.quantity, 0);
    expect(total).toBe(2 * 9500 + 2590);
    expect(body.items.filter((i) => i.id === "frete")).toHaveLength(1);
    expect(body.items.every((i) => i.currency_id === "BRL")).toBe(true);
  });

  test("até 3 parcelas, sem boleto, sem excluir Pix", () => {
    expect(body.payment_methods.installments).toBe(MAX_INSTALLMENTS);
    expect(MAX_INSTALLMENTS).toBe(3);
    expect(body.payment_methods.excluded_payment_types).toEqual([{ id: "ticket" }]);
    const excluded = JSON.stringify(body.payment_methods);
    expect(excluded).not.toContain("pix");
    expect(excluded).not.toContain("bank_transfer");
  });

  test("URLs saem do WEBSITE_URL, com token codificado", () => {
    const back = "https://loja.example.test/pedido/KLG-TESTE?t=tok%20en%2F%2B";
    expect(body.back_urls).toEqual({ success: back, pending: back, failure: back });
    expect(body.notification_url).toBe("https://loja.example.test/api/webhooks/mercadopago");
    expect(body.external_reference).toBe("KLG-TESTE");
  });

  test("só redireciona para domínio do Mercado Pago em HTTPS", () => {
    expect(isAllowedCheckoutUrl("https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1")).toBe(true);
    expect(isAllowedCheckoutUrl("http://www.mercadopago.com.br/x")).toBe(false);
    expect(isAllowedCheckoutUrl("https://mercadopago.com.br.evil.com/x")).toBe(false);
    expect(isAllowedCheckoutUrl(null)).toBe(false);
  });
});

describe("conferência do pagamento", () => {
  const order = { reference: "KLG-A", totalCents: 12090, isTest: true };
  const ok = payment({ id: 1, external_reference: "KLG-A", transaction_amount: 120.9 });

  test("pagamento correto passa", () => {
    expect(checkPaymentMatchesOrder(ok, order, "999")).toEqual({ ok: true });
  });

  test.each([
    ["seller", { collector_id: 111 }],
    ["seller", { collector_id: undefined }],
    ["currency", { currency_id: "USD" }],
    ["amount", { transaction_amount: 120.89 }],
    ["reference", { external_reference: "KLG-B" }],
    ["environment", { live_mode: true }],
  ] as const)("recusa %s divergente", (reason, patch) => {
    expect(checkPaymentMatchesOrder({ ...ok, ...patch }, order, "999")).toEqual({ ok: false, reason });
  });
});

describe("bloqueio de credencial real", () => {
  beforeEach(() => {
    resetMock();
    _resetSellerCache();
    process.env.MERCADOPAGO_ENV = "test";
  });

  test("vendedor de teste esperado é aceito", async () => {
    expect((await assertTestSeller()).id).toBe("999");
  });

  test("conta sem tag test_user é bloqueada", async () => {
    mock.me = { id: 999, tags: ["normal"] };
    await expect(assertTestSeller()).rejects.toThrow("Credencial bloqueada");
  });

  test("outro vendedor é bloqueado", async () => {
    mock.me = { id: 123, tags: ["test_user"] };
    await expect(assertTestSeller()).rejects.toThrow("Credencial bloqueada");
  });

  test("MERCADOPAGO_ENV diferente de test bloqueia antes de chamar a API", async () => {
    process.env.MERCADOPAGO_ENV = "production";
    await expect(assertTestSeller()).rejects.toThrow("MERCADOPAGO_ENV");
    expect(mock.calls).toHaveLength(0);
    process.env.MERCADOPAGO_ENV = "test";
  });
});
