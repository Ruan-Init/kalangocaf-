/**
 * Mercado Pago — Checkout Pro via API de Preferences (REST, só no servidor).
 *
 * Ambiente explícito e vendedor esperado verificado em /users/me.
 * Teste exige test_user; produção recusa test_user e exige webhook configurado.
 * - O prefixo APP_USR não diz nada: credenciais de teste também usam esse prefixo.
 * - Mensagens de erro nunca incluem token, assinatura ou dados do comprador.
 */

const API = "https://api.mercadopago.com";
const TIMEOUT_MS = 10_000;
export const MAX_INSTALLMENTS = 3;

/** Boleto (ticket) sai. Saldo em conta não pode ser excluído no Checkout Pro (regra do Mercado Pago). */
export const EXCLUDED_PAYMENT_TYPES = ["ticket"] as const;

export type MpEnv = "test" | "production" | "disabled";

export function mpEnv(): MpEnv {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) return "disabled";
  const env = process.env.MERCADOPAGO_ENV;
  if (env === "test") return "test";
  if (env === "production") return "production";
  return "disabled";
}

export class MercadoPagoError extends Error {
  /** true quando vale tentar de novo (rede, 5xx, 429). */
  readonly retryable: boolean;
  readonly status: number | null;
  constructor(message: string, opts: { retryable: boolean; status?: number | null }) {
    super(message);
    this.name = "MercadoPagoError";
    this.retryable = opts.retryable;
    this.status = opts.status ?? null;
  }
}

function token() {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new MercadoPagoError("Mercado Pago não configurado", { retryable: false });
  return t;
}

async function mpFetch<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token()}`,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new MercadoPagoError(`Falha de rede ao chamar o Mercado Pago (${path.split("?")[0]})`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    const retryable = res.status >= 500 || res.status === 429;
    // Só o código HTTP vai para a mensagem — o corpo pode ecoar dados do pedido.
    throw new MercadoPagoError(
      `Mercado Pago respondeu ${res.status} em ${path.split("?")[0].replace(/\/\d+$/, "/:id")}`,
      { retryable, status: res.status }
    );
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- vendedor

type MpUser = { id: number; tags?: string[]; site_id?: string };

let sellerCache: {
  at: number;
  token: string;
  env: MpEnv;
  seller: { id: string; isTestUser: boolean; siteId?: string };
} | null = null;

/** Só para os testes automatizados. */
export function _resetSellerCache() {
  sellerCache = null;
}

/** Configuração mínima; não substitui a verificação da conta na API. */
export function paymentsConfigured() {
  const env = mpEnv();
  if (env === "disabled" || !process.env.MERCADOPAGO_SELLER_ID) return false;
  if (env === "production" && !process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()) return false;
  try {
    siteUrl();
    return true;
  } catch {
    return false;
  }
}

export function orderEnvironmentMatches(order: { isTest?: boolean | null }) {
  const env = mpEnv();
  return env !== "disabled" && Boolean(order.isTest) === (env === "test");
}

export function assertOrderEnvironment(order: { isTest?: boolean | null }) {
  if (!orderEnvironmentMatches(order)) {
    throw new MercadoPagoError("Este pedido pertence a outro ambiente de pagamento", {
      retryable: false,
    });
  }
}

/** Impede mistura entre credenciais, vendedor e ambiente. */
export async function assertSeller() {
  const env = mpEnv();
  if (!paymentsConfigured()) {
    throw new MercadoPagoError("Mercado Pago sem configuração completa para o ambiente selecionado", {
      retryable: false,
    });
  }
  const expected = process.env.MERCADOPAGO_SELLER_ID;
  const currentToken = token();
  if (!sellerCache || sellerCache.token !== currentToken || sellerCache.env !== env ||
      Date.now() - sellerCache.at > 10 * 60_000) {
    const me = await mpFetch<MpUser>("/users/me");
    sellerCache = {
      at: Date.now(),
      token: currentToken,
      env,
      seller: { id: String(me.id), isTestUser: (me.tags ?? []).includes("test_user"), siteId: me.site_id },
    };
  }
  const { seller } = sellerCache;
  if (seller.id !== expected || seller.isTestUser !== (env === "test") ||
      (env === "production" && seller.siteId !== "MLB")) {
    throw new MercadoPagoError(
      "Credencial bloqueada: vendedor ou ambiente não corresponde à configuração",
      { retryable: false }
    );
  }
  return seller;
}

/** Mantém a validação estrita de teste para chamadas que exigem esse ambiente. */
export async function assertTestSeller() {
  if (mpEnv() !== "test") {
    throw new MercadoPagoError("Pagamentos desativados: MERCADOPAGO_ENV não está em teste", {
      retryable: false,
    });
  }
  return assertSeller();
}

// ---------------------------------------------------------------- URLs

export function siteUrl() {
  const raw = process.env.WEBSITE_URL;
  if (!raw) throw new MercadoPagoError("WEBSITE_URL ausente", { retryable: false });
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new MercadoPagoError("WEBSITE_URL precisa ser HTTPS", { retryable: false });
  }
  return url.origin;
}

export function orderReturnUrl(reference: string, accessToken: string) {
  return `${siteUrl()}/pedido/${encodeURIComponent(reference)}?t=${encodeURIComponent(accessToken)}`;
}

export function webhookUrl() {
  return `${siteUrl()}/api/webhooks/mercadopago`;
}

const CHECKOUT_HOSTS = [
  "www.mercadopago.com.br",
  "mercadopago.com.br",
  "sandbox.mercadopago.com.br",
];

/** Só redireciona para páginas oficiais do Mercado Pago, em HTTPS. */
export function isAllowedCheckoutUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password &&
      (!u.port || u.port === "443") && CHECKOUT_HOSTS.includes(u.hostname) &&
      (mpEnv() !== "production" || u.hostname !== "sandbox.mercadopago.com.br");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- preference

export type PreferenceLine = {
  id: string;
  title: string;
  quantity: number;
  unitCents: number;
};

export type PreferenceInput = {
  reference: string;
  accessToken: string;
  lines: PreferenceLine[];
  shippingCents: number;
  shippingLabel: string;
  payer: { name: string; email: string };
  /** Chave estável enviada como X-Idempotency-Key; não muda entre retries. */
  idempotencyKey: string;
};

function reais(cents: number) {
  return Math.round(cents) / 100;
}

/** Corpo da preference. Separado para ser testado sem rede. */
export function buildPreferenceBody(input: PreferenceInput) {
  const back = orderReturnUrl(input.reference, input.accessToken);
  const items = input.lines.map((l) => ({
    id: l.id,
    title: l.title.slice(0, 250),
    quantity: l.quantity,
    unit_price: reais(l.unitCents),
    currency_id: "BRL",
  }));
  // Frete entra uma única vez, como item próprio — o total da preference fica
  // exatamente igual ao total gravado no pedido.
  if (input.shippingCents > 0) {
    items.push({
      id: "frete",
      title: `Frete — ${input.shippingLabel}`.slice(0, 250),
      quantity: 1,
      unit_price: reais(input.shippingCents),
      currency_id: "BRL",
    });
  }
  return {
    items,
    external_reference: input.reference,
    payer: { name: input.payer.name, email: input.payer.email },
    back_urls: { success: back, pending: back, failure: back },
    auto_return: "approved",
    notification_url: webhookUrl(),
    statement_descriptor: "KALANGO CAFE",
    payment_methods: {
      excluded_payment_types: EXCLUDED_PAYMENT_TYPES.map((id) => ({ id })),
      excluded_payment_methods: [] as { id: string }[],
      installments: MAX_INSTALLMENTS,
    },
    metadata: { order_reference: input.reference },
  };
}

type MpPreference = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

export async function createPreference(input: PreferenceInput) {
  await assertSeller();
  const pref = await mpFetch<MpPreference>("/checkout/preferences", {
    method: "POST",
    body: buildPreferenceBody(input),
    idempotencyKey: input.idempotencyKey,
  });
  // Produção nunca usa sandbox, mesmo se a API omitir init_point.
  const url = mpEnv() === "production" ? pref.init_point : pref.init_point ?? pref.sandbox_init_point;
  if (!pref.id || !isAllowedCheckoutUrl(url)) {
    throw new MercadoPagoError("Mercado Pago devolveu uma preference sem link válido", {
      retryable: true,
    });
  }
  return { preferenceId: pref.id, checkoutUrl: url };
}

export type PixPaymentInput = {
  reference: string;
  amountCents: number;
  description: string;
  payer: {
    name: string;
    email: string;
    document: string;
    zip: string;
    street: string;
    number: string;
    district: string;
    city: string;
    state: string;
  };
  idempotencyKey: string;
};

type PixPaymentResponse = MpPayment & {
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
  date_of_expiration?: string;
};

export async function createPixPayment(input: PixPaymentInput) {
  await assertSeller();
  const [firstName, ...lastNames] = input.payer.name.trim().split(/\s+/);
  const payment = await mpFetch<PixPaymentResponse>("/v1/payments", {
    method: "POST",
    body: {
      transaction_amount: reais(input.amountCents),
      description: input.description.slice(0, 250),
      payment_method_id: "pix",
      external_reference: input.reference,
      notification_url: webhookUrl(),
      date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      payer: {
        email: input.payer.email,
        first_name: firstName,
        last_name: lastNames.join(" ") || firstName,
        identification: { type: "CPF", number: input.payer.document },
        address: {
          zip_code: input.payer.zip,
          street_name: input.payer.street,
          street_number: input.payer.number,
          neighborhood: input.payer.district,
          city: input.payer.city,
          federal_unit: input.payer.state,
        },
      },
    },
    idempotencyKey: input.idempotencyKey,
  });
  const transactionData = payment.point_of_interaction?.transaction_data;
  const qrCode = transactionData?.qr_code;
  const qrCodeBase64 = transactionData?.qr_code_base64;
  if (!payment.id || !qrCode || !qrCodeBase64 || !payment.date_of_expiration) {
    throw new MercadoPagoError("Mercado Pago devolveu um Pix sem os dados de pagamento", {
      retryable: true,
    });
  }
  return {
    paymentId: String(payment.id),
    status: payment.status,
    statusDetail: payment.status_detail ?? null,
    qrCode,
    qrCodeBase64,
    expiresAt: new Date(payment.date_of_expiration),
  };
}

export type PreapprovalInput = {
  reference: string;
  planName: string;
  amountCents: number;
  email: string;
  idempotencyKey: string;
};

export type MpPreapproval = {
  id: string;
  status: string;
  live_mode?: boolean;
  external_reference?: string | number | null;
  collector_id?: number;
  payer_email?: string;
  init_point?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
  };
};

export async function createPreapproval(input: PreapprovalInput) {
  await assertSeller();
  const back = `${siteUrl()}/clube?retorno=cartao`;
  const preapproval = await mpFetch<MpPreapproval>("/preapproval", {
    method: "POST",
    body: {
      reason: `Clube Kalango — ${input.planName}`,
      external_reference: input.reference,
      payer_email: input.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: reais(input.amountCents),
        currency_id: "BRL",
      },
      back_url: back,
      notification_url: webhookUrl(),
      status: "pending",
    },
    idempotencyKey: input.idempotencyKey,
  });
  if (!preapproval.id || !isAllowedCheckoutUrl(preapproval.init_point)) {
    throw new MercadoPagoError("Mercado Pago devolveu uma assinatura sem link válido", {
      retryable: true,
    });
  }
  return {
    preapprovalId: preapproval.id,
    checkoutUrl: preapproval.init_point,
    status: preapproval.status,
  };
}

export async function getPreapproval(preapprovalId: string): Promise<MpPreapproval | null> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(preapprovalId)) return null;
  try {
    return await mpFetch<MpPreapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status === 404) return null;
    throw error;
  }
}

export type MpAuthorizedPayment = {
  id: string;
  preapproval_id?: string;
  payment?: { id?: number | string };
};

export async function getAuthorizedPayment(
  authorizedPaymentId: string,
): Promise<MpAuthorizedPayment | null> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(authorizedPaymentId)) return null;
  try {
    return await mpFetch<MpAuthorizedPayment>(
      `/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`,
    );
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status === 404) return null;
    throw error;
  }
}

// ---------------------------------------------------------------- pagamentos

export type MpPayment = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id: string;
  collector_id?: number;
  live_mode?: boolean;
  date_approved?: string | null;
  date_created?: string;
  payment_type_id?: string;
  payment_method_id?: string;
};

/** Pagamento pelo ID. Devolve null para 404 (ex.: ID inventado pelo simulador). */
export async function getPayment(paymentId: string): Promise<MpPayment | null> {
  if (!/^\d{1,20}$/.test(paymentId)) return null;
  try {
    return await mpFetch<MpPayment>(`/v1/payments/${paymentId}`);
  } catch (err) {
    if (err instanceof MercadoPagoError && err.status === 404) return null;
    throw err;
  }
}

/** Pagamentos de um pedido (mais recentes primeiro) — recupera quando o webhook não chega. */
export async function searchPaymentsByReference(reference: string): Promise<MpPayment[]> {
  const qs = new URLSearchParams({
    external_reference: reference,
    sort: "date_created",
    criteria: "desc",
    limit: "20",
  });
  const res = await mpFetch<{ results?: MpPayment[] }>(`/v1/payments/search?${qs}`);
  return res.results ?? [];
}

export type PaymentCheck =
  | { ok: true }
  | { ok: false; reason: "seller" | "currency" | "amount" | "reference" | "environment" };

/**
 * Confere se o pagamento pertence mesmo a este pedido. Status/valor do corpo
 * da notificação nunca entram aqui — só o que a API devolveu.
 */
export function checkPaymentMatchesOrder(
  payment: MpPayment,
  order: { reference: string; totalCents: number; isTest: boolean | null },
  sellerId: string
): PaymentCheck {
  if (payment.collector_id !== undefined && String(payment.collector_id) !== sellerId) {
    return { ok: false, reason: "seller" };
  }
  if (payment.collector_id === undefined) return { ok: false, reason: "seller" };
  // Teste legado sem live_mode ainda é isolado pela conta de teste verificada.
  // Produção exige live_mode=true vindo da API; nunca do corpo do webhook.
  if (!orderEnvironmentMatches(order) ||
      (mpEnv() === "test" && payment.live_mode === true) ||
      (mpEnv() === "production" && payment.live_mode !== true)) {
    return { ok: false, reason: "environment" };
  }
  if (payment.currency_id !== "BRL") return { ok: false, reason: "currency" };
  if ((payment.external_reference ?? "") !== order.reference) {
    return { ok: false, reason: "reference" };
  }
  if (Math.round(payment.transaction_amount * 100) !== order.totalCents) {
    return { ok: false, reason: "amount" };
  }
  return { ok: true };
}
