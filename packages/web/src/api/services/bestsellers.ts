/**
 * "Mais vendidos da semana" da home.
 *
 * Fonte: pedidos de venda do Bling dos últimos 7 dias (inclui os pedidos do site,
 * que vão pro Bling quando pagos, e as vendas de balcão/atacado lançadas lá).
 * Cada item é casado com um café do site pelo ID do produto no Bling, pelo SKU ou
 * pelo nome entre parênteses ("Café Kalango (Chocolate) 1Kg" → Chocolate), e
 * somado em gramas — assim 1 pacote de 1 kg pesa como 4 de 250 g.
 *
 * O cálculo roda em segundo plano e fica guardado em memória e no banco
 * (tabela site_cache) por CACHE_TTL_MS; a home nunca espera o Bling.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { blingConfigured, blingFetch, getConnection, isConnected } from "./bling-client";

import { publishedCoffee } from "./bling-publish";

const CACHE_KEY = "bestsellers:week";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 h
const RETRY_AFTER_ERROR_MS = 20 * 60 * 1000;
const WINDOW_DAYS = 7;
const TOP = 3;
/** Situações do Bling que não contam como venda. */
const IGNORED_STATUS = new Set([12]); // 12 = Cancelado

export type Bestsellers = {
  /** "week" = ranking real dos últimos 7 dias; "fallback" = sem vendas/sem Bling. */
  source: "week" | "fallback";
  from: string;
  to: string;
  computedAt: string;
  /** IDs de produtos do site, do mais vendido para o menos. */
  productIds: number[];
  orders: number;
  error?: string | null;
};

type BlingOrderSummary = { id: number; data: string; situacao?: { id?: number } };
type BlingOrderItem = {
  codigo?: string;
  descricao?: string;
  quantidade?: number;
  produto?: { id?: number };
};

let memory: Bestsellers | null = null;
let running: Promise<Bestsellers> | null = null;
let lastErrorAt = 0;

function norm(v: string) {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "Café Kalango (Doce Cerrado ) 250g" → "doce cerrado". */
function nameKey(descricao: string) {
  const inside = descricao.match(/\(([^)]+)\)/)?.[1];
  const raw = inside
    ?? descricao
      .replace(/^\s*caf[eé]\s+(especial\s+)?kalango\s*[-–—:|]?\s*/i, "")
      .replace(/\s*[-–—|]?\s*\(?\d+([.,]\d+)?\s*(g|gr|gramas|kg)\)?\s*$/i, "");
  return norm(raw);
}

/** Peso do pacote pela descrição; sem peso, assume 250 g. */
function gramsOf(descricao: string) {
  const m = descricao.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr)\b/i);
  if (!m) return 250;
  const n = Number(m[1].replace(",", "."));
  return m[2].toLowerCase() === "kg" ? n * 1000 : n;
}

function saoPauloDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

async function fallback(error: string | null, from: string, to: string): Promise<Bestsellers> {
  const list = await db.select().from(schema.products).where(and(eq(schema.products.active, true), publishedCoffee()));
  const ids = list
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.position - b.position)
    .slice(0, TOP)
    .map((p) => p.id);
  return { source: "fallback", from, to, computedAt: new Date().toISOString(), productIds: ids, orders: 0, error };
}

async function compute(): Promise<Bestsellers> {
  const now = new Date();
  const to = saoPauloDate(now);
  const from = saoPauloDate(new Date(now.getTime() - (WINDOW_DAYS - 1) * 86_400_000));

  if (!blingConfigured() || !isConnected(await getConnection())) {
    return fallback("Bling não conectado", from, to);
  }

  const products = await db.select().from(schema.products).where(and(eq(schema.products.active, true), publishedCoffee()));
  const byBlingId = new Map(products.filter((p) => p.blingId).map((p) => [p.blingId!, p.id]));
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!.trim(), p.id]));
  const byName = new Map(products.map((p) => [norm(p.name), p.id]));

  // 1) Pedidos da semana (paginado).
  const summaries: BlingOrderSummary[] = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const r = await blingFetch<{ data: BlingOrderSummary[] }>("/pedidos/vendas", {
      query: { dataInicial: from, dataFinal: to, limite: 100, pagina },
    });
    summaries.push(...r.data);
    if (r.data.length < 100) break;
  }
  const valid = summaries.filter((o) => !IGNORED_STATUS.has(Number(o.situacao?.id)));

  // 2) Itens de cada pedido. Um pacote de 1 kg pesa como 4 de 250 g.
  const grams = new Map<number, number>();
  for (const o of valid) {
    const r = await blingFetch<{ data: { itens?: BlingOrderItem[] } }>(`/pedidos/vendas/${o.id}`);
    for (const it of r.data.itens ?? []) {
      const desc = it.descricao ?? "";
      const id = (it.produto?.id && byBlingId.get(it.produto.id))
        || (it.codigo && bySku.get(it.codigo.trim()))
        || byName.get(nameKey(desc));
      if (!id) continue; // café que não está no site (ex.: Jangada) ou outro item
      const q = Number(it.quantidade) || 0;
      grams.set(id, (grams.get(id) ?? 0) + q * gramsOf(desc));
    }
  }

  const ranked = [...grams.entries()].filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return fallback(null, from, to);

  // Menos de 3 cafés vendidos na semana: completa com os destaques da casa.
  const ids = ranked.map(([id]) => id).slice(0, TOP);
  if (ids.length < TOP) {
    const fill = await fallback(null, from, to);
    for (const id of fill.productIds) if (ids.length < TOP && !ids.includes(id)) ids.push(id);
  }
  return { source: "week", from, to, computedAt: new Date().toISOString(), productIds: ids, orders: valid.length, error: null };
}

async function loadStored(): Promise<Bestsellers | null> {
  try {
    const [row] = await db.select().from(schema.siteCache).where(eq(schema.siteCache.key, CACHE_KEY)).limit(1);
    return (row?.value as Bestsellers | undefined) ?? null;
  } catch {
    return null;
  }
}

async function store(v: Bestsellers) {
  try {
    await db
      .insert(schema.siteCache)
      .values({ key: CACHE_KEY, value: v, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.siteCache.key, set: { value: v, updatedAt: new Date() } });
  } catch (err) {
    console.error("[bestsellers] não salvou cache:", (err as Error).message);
  }
}

function isFresh(v: Bestsellers | null) {
  return Boolean(v && Date.now() - new Date(v.computedAt).getTime() < CACHE_TTL_MS);
}

/** Recalcula em segundo plano (uma execução por vez). */
export function refreshBestsellers(): Promise<Bestsellers> {
  if (running) return running;
  running = (async () => {
    try {
      const v = await compute();
      memory = v;
      await store(v);
      return v;
    } catch (err) {
      lastErrorAt = Date.now();
      const msg = (err as Error).message;
      console.error("[bestsellers]", msg);
      // Mantém o último ranking bom; sem nenhum, usa os destaques.
      const prev = memory ?? (await loadStored());
      if (prev) return prev;
      const now = saoPauloDate(new Date());
      return fallback(msg, now, now);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Ranking atual sem esperar o Bling: devolve o cache e dispara a atualização se venceu. */
export async function getBestsellers(): Promise<Bestsellers> {
  if (!memory) memory = await loadStored();
  if (!isFresh(memory) && !running && Date.now() - lastErrorAt > RETRY_AFTER_ERROR_MS) {
    void refreshBestsellers();
  }
  if (memory) return memory;
  // Primeira vez de todas: não segura a home, mostra os destaques enquanto calcula.
  const now = saoPauloDate(new Date());
  return fallback(null, now, now);
}
