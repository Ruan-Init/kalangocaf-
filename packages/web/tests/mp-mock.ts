/** Mercado Pago falso para os testes: substitui o fetch global. */
import type {
  MpAuthorizedPayment,
  MpPayment,
  MpPreapproval,
} from "../src/api/services/mercadopago";

export const mock = {
  me: { id: 999, tags: ["test_user", "normal"], site_id: "MLB" } as { id: number; tags: string[]; site_id?: string },
  payments: new Map<string, MpPayment>(),
  preapprovals: new Map<string, MpPreapproval>(),
  authorizedPayments: new Map<string, MpAuthorizedPayment>(),
  preapprovalRequests: [] as Record<string, unknown>[],
  preferences: [] as Record<string, unknown>[],
  failPreference: 0,
  failPayments: false,
  calls: [] as string[],
  preferenceKeys: [] as string[],
  preferenceReply: null as { id: string; init_point?: string; sandbox_init_point?: string } | null,
  pixPayments: [] as Record<string, unknown>[],
  pixPaymentRequests: [] as Record<string, unknown>[],
  failPixPayment: 0,
  failPreapproval: 0,
};

export function resetMock() {
  mock.me = { id: 999, tags: ["test_user", "normal"], site_id: "MLB" };
  mock.payments.clear();
  mock.preapprovals.clear();
  mock.authorizedPayments.clear();
  mock.preapprovalRequests = [];
  mock.preferences = [];
  mock.failPreference = 0;
  mock.failPayments = false;
  mock.calls = [];
  mock.preferenceKeys = [];
  mock.preferenceReply = null;
  mock.pixPayments = [];
  mock.pixPaymentRequests = [];
  mock.failPixPayment = 0;
  mock.failPreapproval = 0;
}

/** Outras APIs simuladas (ex.: Bling) registram o próprio host aqui. */
export const otherHosts = new Map<string, (url: URL, init?: RequestInit) => Promise<Response>>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function payment(p: Partial<MpPayment> & { id: number; external_reference: string; transaction_amount: number }): MpPayment {
  return {
    status: "approved",
    status_detail: "accredited",
    currency_id: "BRL",
    collector_id: 999,
    live_mode: false,
    date_created: new Date().toISOString(),
    ...p,
  };
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = init?.method ?? "GET";
  mock.calls.push(`${method} ${url.pathname}`);
  const other = otherHosts.get(url.hostname);
  if (other) return other(url, init);
  if (url.hostname !== "api.mercadopago.com") throw new Error(`fetch inesperado: ${url.href}`);

  if (url.pathname === "/users/me") return json(mock.me);

  if (url.pathname === "/checkout/preferences" && method === "POST") {
    mock.preferenceKeys.push(new Headers(init?.headers).get("X-Idempotency-Key") ?? "");
    if (mock.failPreference > 0) {
      mock.failPreference--;
      return json({ message: "erro" }, 500);
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    mock.preferences.push(body);
    const id = `pref-${mock.preferences.length}`;
    return json(mock.preferenceReply ?? {
      id,
      init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}`,
      sandbox_init_point: `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}`,
    }, 201);
  }

  if (url.pathname === "/v1/payments" && method === "POST") {
    if (mock.failPixPayment > 0) {
      mock.failPixPayment--;
      return json({ message: "erro" }, 500);
    }
    const body = JSON.parse(String(init?.body)) as {
      transaction_amount: number;
      external_reference: string;
      date_of_expiration: string;
    };
    mock.pixPaymentRequests.push(body);
    const id = String(7000 + mock.pixPayments.length);
    const pix = {
      ...payment({
        id: Number(id),
        status: "pending",
        external_reference: body.external_reference,
        transaction_amount: body.transaction_amount,
        payment_method_id: "pix",
      }),
      point_of_interaction: {
        transaction_data: {
          qr_code: `pix-copia-cola-${id}`,
          qr_code_base64: "cXItY29kZQ==",
        },
      },
      date_of_expiration: body.date_of_expiration,
    };
    mock.pixPayments.push(pix);
    mock.payments.set(id, pix);
    return json(pix, 201);
  }

  if (url.pathname === "/preapproval" && method === "POST") {
    if (mock.failPreapproval > 0) {
      mock.failPreapproval--;
      return json({ message: "erro" }, 500);
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    mock.preapprovalRequests.push(body);
    const id = `pre-${mock.preapprovalRequests.length}`;
    const preapproval: MpPreapproval = {
      id,
      status: "pending",
      live_mode: false,
      collector_id: 999,
      external_reference: body.external_reference as string,
      payer_email: body.payer_email as string,
      auto_recurring: body.auto_recurring as MpPreapproval["auto_recurring"],
      init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`,
    };
    mock.preapprovals.set(id, preapproval);
    return json(preapproval, 201);
  }

  const authorizedPaymentMatch = url.pathname.match(/^\/authorized_payments\/([A-Za-z0-9_-]+)$/);
  if (authorizedPaymentMatch) {
    const authorized = mock.authorizedPayments.get(authorizedPaymentMatch[1]);
    return authorized ? json(authorized) : json({ message: "not found" }, 404);
  }

  const preapprovalMatch = url.pathname.match(/^\/preapproval\/([A-Za-z0-9_-]+)$/);
  if (preapprovalMatch) {
    const preapproval = mock.preapprovals.get(preapprovalMatch[1]);
    return preapproval ? json(preapproval) : json({ message: "not found" }, 404);
  }

  if (url.pathname === "/v1/payments/search") {
    if (mock.failPayments) return json({}, 503);
    const ref = url.searchParams.get("external_reference");
    const results = [...mock.payments.values()]
      .filter((p) => p.external_reference === ref)
      .sort((a, b) => (b.date_created ?? "").localeCompare(a.date_created ?? ""));
    return json({ results });
  }

  const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
  if (m) {
    if (mock.failPayments) return json({}, 503);
    const p = mock.payments.get(m[1]);
    return p ? json(p) : json({ message: "not found" }, 404);
  }

  return json({ message: "rota não simulada" }, 404);
}) as typeof fetch;
