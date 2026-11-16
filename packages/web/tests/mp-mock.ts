/** Mercado Pago falso para os testes: substitui o fetch global. */
import type { MpPayment } from "../src/api/services/mercadopago";

export const mock = {
  me: { id: 999, tags: ["test_user", "normal"], site_id: "MLB" } as { id: number; tags: string[]; site_id?: string },
  payments: new Map<string, MpPayment>(),
  preferences: [] as Record<string, unknown>[],
  failPreference: 0,
  failPayments: false,
  calls: [] as string[],
  preferenceKeys: [] as string[],
  preferenceReply: null as { id: string; init_point?: string; sandbox_init_point?: string } | null,
};

export function resetMock() {
  mock.me = { id: 999, tags: ["test_user", "normal"], site_id: "MLB" };
  mock.payments.clear();
  mock.preferences = [];
  mock.failPreference = 0;
  mock.failPayments = false;
  mock.calls = [];
  mock.preferenceKeys = [];
  mock.preferenceReply = null;
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
