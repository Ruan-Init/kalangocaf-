/**
 * Cotação de frete via Melhor Envio.
 *
 * Sem MELHOR_ENVIO_TOKEN no .env, cai na tabela estática de contingência —
 * o checkout nunca quebra por causa de API de terceiro fora do ar.
 *
 * Docs: https://docs.menv.io/  (POST /api/v2/me/shipment/calculate)
 */

import { STORE } from "../config/store";

export type ShippingOption = {
  /** id do serviço no Melhor Envio, ou "retirada" / "pac"|"sedex" no fallback */
  id: string;
  /** "PAC", "SEDEX", "Mini Envios"... */
  service: string;
  company: string;
  label: string;
  cents: number;
  deliveryDaysMin: number | null;
  deliveryDaysMax: number | null;
  /** true quando veio da tabela de contingência, não da API */
  estimated: boolean;
};

export type ShippingQuoteItem = {
  priceCents: number;
  quantity: number;
  weightGrams: number;
};

const TOKEN = process.env.MELHOR_ENVIO_TOKEN ?? null;
const BASE = process.env.MELHOR_ENVIO_ENV === "production"
  ? "https://melhorenvio.com.br"
  : "https://sandbox.melhorenvio.com.br";

export const melhorEnvioReady = Boolean(TOKEN);

/** Tabela de contingência: usada sem token ou quando a API falha. */
const FALLBACK: ShippingOption[] = [
  {
    id: "pac",
    service: "PAC",
    company: "Correios",
    label: "PAC — Correios",
    cents: 2490,
    deliveryDaysMin: 5,
    deliveryDaysMax: 9,
    estimated: true,
  },
  {
    id: "sedex",
    service: "SEDEX",
    company: "Correios",
    label: "SEDEX — Correios",
    cents: 3990,
    deliveryDaysMin: 2,
    deliveryDaysMax: 4,
    estimated: true,
  },
];

export const PICKUP: ShippingOption = {
  id: "retirada",
  service: "Retirada",
  company: "Kalango",
  label: "Retirar na torrefação — Lago Norte, Brasília",
  cents: 0,
  deliveryDaysMin: null,
  deliveryDaysMax: null,
  estimated: false,
};

type MelhorEnvioService = {
  id: number | string;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  delivery_range?: { min?: number; max?: number };
  company?: { name?: string };
  error?: string;
};

function toCents(v: string | number | undefined) {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  if (!n || Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

/** Cache curto por CEP+carrinho — evita bater na API a cada tecla no checkout. */
const cache = new Map<string, { at: number; options: ShippingOption[] }>();
const TTL_MS = 10 * 60 * 1000;

function cacheKey(postalCode: string, items: ShippingQuoteItem[]) {
  const cart = items
    .map((i) => `${i.weightGrams}x${i.quantity}@${i.priceCents}`)
    .sort()
    .join("|");
  return `${postalCode}::${cart}`;
}

async function callMelhorEnvio(
  postalCode: string,
  items: ShippingQuoteItem[]
): Promise<ShippingOption[]> {
  const insuranceValue = items.reduce((s, i) => s + (i.priceCents * i.quantity) / 100, 0);
  const pkg = STORE.package250g;

  const body = {
    from: { postal_code: STORE.originPostalCode },
    to: { postal_code: postalCode },
    products: items.map((item, index) => ({
      id: String(index + 1),
      width: pkg.widthCm,
      height: pkg.heightCm,
      length: pkg.lengthCm,
      weight: (item.weightGrams || 250) / 1000,
      insurance_value: item.priceCents / 100,
      quantity: item.quantity,
    })),
    options: { receipt: false, own_hand: false, insurance_value: insuranceValue },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${BASE}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": `${STORE.name} (${STORE.email})`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("[melhor-envio] HTTP", res.status, await res.text().catch(() => ""));
      return [];
    }

    const data = (await res.json()) as MelhorEnvioService[];
    if (!Array.isArray(data)) return [];

    return data.flatMap((s) => {
      if (s.error) return [];
      const cents = toCents(s.custom_price ?? s.price);
      if (cents === null) return [];
      const company = s.company?.name ?? "Transportadora";
      const service = s.name ?? "Frete";
      return [{
        id: String(s.id),
        service,
        company,
        label: `${service} — ${company}`,
        cents,
        deliveryDaysMin: s.delivery_range?.min ?? s.delivery_time ?? null,
        deliveryDaysMax: s.delivery_range?.max ?? s.delivery_time ?? null,
        estimated: false,
      }];
    });
  } catch (err) {
    console.error("[melhor-envio] falha na cotação:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Opções de frete para um CEP. Sempre inclui a retirada na torrefação.
 * Nunca lança: em qualquer falha devolve a tabela de contingência.
 */
export async function quoteShipping(
  rawPostalCode: string,
  items: ShippingQuoteItem[]
): Promise<{ options: ShippingOption[]; source: "melhor-envio" | "fallback" }> {
  const postalCode = rawPostalCode.replace(/\D/g, "");
  const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const free = subtotalCents >= STORE.freeShippingFromCents;

  const withPickup = (options: ShippingOption[]) => {
    const priced = free ? options.map((o) => ({ ...o, cents: 0 })) : options;
    return [...priced.sort((a, b) => a.cents - b.cents), PICKUP];
  };

  if (postalCode.length !== 8 || items.length === 0) {
    return { options: withPickup(FALLBACK), source: "fallback" };
  }

  const key = cacheKey(postalCode, items);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { options: withPickup(hit.options), source: "melhor-envio" };
  }

  if (!TOKEN) return { options: withPickup(FALLBACK), source: "fallback" };

  const live = await callMelhorEnvio(postalCode, items);
  if (live.length === 0) return { options: withPickup(FALLBACK), source: "fallback" };

  cache.set(key, { at: Date.now(), options: live });
  return { options: withPickup(live), source: "melhor-envio" };
}

/** Resolve o serviço escolhido pelo cliente — o preço vem daqui, nunca do browser. */
export async function resolveShipping(
  postalCode: string,
  items: ShippingQuoteItem[],
  serviceId: string
): Promise<ShippingOption> {
  if (serviceId === PICKUP.id) return PICKUP;
  const { options } = await quoteShipping(postalCode, items);
  return options.find((o) => o.id === serviceId) ?? options[0] ?? PICKUP;
}
