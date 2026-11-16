/**
 * Bling → site: preço, estoque, nome e descrição dos cafés.
 *
 * - O vínculo é pelo SKU (codigo no Bling = products.sku). Depois do primeiro
 *   encontro o ID do Bling fica salvo (products.blingId) — webhooks de estoque
 *   só trazem o ID.
 * - Café novo só nasce no site se estiver na categoria escolhida no painel
 *   (o mesmo Bling tem outros itens do WooCommerce).
 * - Fotos locais já escolhidas nunca são trocadas. Café novo usa a foto do Bling.
 * - Cadastros da gestão são enviados pelo bling-publish; este serviço só lê o ERP.
 *   Rascunhos em publicação não são alterados por webhooks/sincronização.
 */
import { and, eq, inArray, isNotNull, max, or } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { BlingError, blingFetch, getConnection, isConnected, updateConnection } from "./bling-client";

export type BlingProduct = {
  id: number;
  nome?: string;
  codigo?: string;
  preco?: number;
  tipo?: string;
  situacao?: string;
  formato?: string;
  idProdutoPai?: number | null;
  descricaoCurta?: string;
  descricaoComplementar?: string;
  imagemURL?: string;
  pesoLiquido?: number;
  categoria?: { id?: number };
  estoque?: { saldoVirtualTotal?: number };
  midia?: { imagens?: { externas?: { link?: string }[]; internas?: { link?: string }[] } };
};

import { publicationOpen, publishedCoffee, publishedMerch } from "./bling-publish";

type Product = typeof schema.products.$inferSelect;

// ---------------------------------------------------------------- mapeamento

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  agrave: "à", atilde: "ã", otilde: "õ", acirc: "â", ecirc: "ê", ocirc: "ô",
  ccedil: "ç", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  Atilde: "Ã", Otilde: "Õ", Ccedil: "Ç", ordm: "º", ordf: "ª", deg: "°",
};

/** Descrição do Bling costuma vir em HTML (herdada do WooCommerce). */
export function htmlToText(html: string | null | undefined) {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "Café Kalango Doce Cerrado 250g" → "Doce Cerrado". Sem padrão reconhecível, fica igual. */
export function displayName(nome: string) {
  const clean = nome
    .replace(/^\s*caf[eé]\s+(especial\s+)?kalango\s*[-–—:|]?\s*/i, "")
    .replace(/\s*[-–—|]?\s*\(?\d+([.,]\d+)?\s*(g|gr|gramas|kg)\)?\s*$/i, "")
    .trim();
  return clean || nome.trim();
}

export function weightFrom(p: BlingProduct) {
  if (p.pesoLiquido && p.pesoLiquido > 0) return Math.round(p.pesoLiquido * 1000);
  const m = (p.nome ?? "").match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr)\b/i);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    return Math.round(/kg/i.test(m[2]) ? n * 1000 : n);
  }
  return 250;
}

export function slugify(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function firstSentence(text: string) {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  const m = line.match(/^(.{20,180}?[.!?])(\s|$)/);
  return (m ? m[1] : line.slice(0, 160)).trim() || null;
}

function imageOf(p: BlingProduct) {
  const ext = p.midia?.imagens?.externas?.find((i) => i.link)?.link;
  const url = ext ?? p.imagemURL ?? p.midia?.imagens?.internas?.find((i) => i.link)?.link;
  return url?.startsWith("https://") ? url : null;
}

function stockOf(p: BlingProduct) {
  const v = p.estoque?.saldoVirtualTotal;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;
}

/** Campos que o Bling manda no site. Só entra o que veio preenchido e mudou. */
export function changesFor(site: Product, p: BlingProduct) {
  const set: Partial<typeof schema.products.$inferInsert> = {};
  if (site.blingId !== p.id) set.blingId = p.id;
  if (p.nome) {
    const name = displayName(p.nome);
    if (name !== site.name) set.name = name;
    if (p.nome !== site.blingName) set.blingName = p.nome;
  }
  if (typeof p.preco === "number" && p.preco > 0) {
    const cents = Math.round(p.preco * 100);
    if (cents !== site.priceCents) set.priceCents = cents;
  }
  const stock = stockOf(p);
  if (stock !== null && stock !== site.stock) set.stock = stock;
  const desc = htmlToText(p.descricaoCurta);
  if (desc && desc !== site.description) set.description = desc;
  if (p.situacao) {
    const active = p.situacao === "A";
    if (active !== site.active) set.active = active;
  }
  if (site.images.length === 0) {
    const img = imageOf(p);
    if (img) set.images = [img];
  }
  return set;
}

async function uniqueSlug(base: string) {
  const root = base || "cafe-kalango";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
    if (!hit) return slug;
  }
  return `${root}-${Date.now()}`;
}

async function createFromBling(p: BlingProduct) {
  const name = displayName(p.nome ?? "Café");
  const desc = htmlToText(p.descricaoCurta) || null;
  const extra = htmlToText(p.descricaoComplementar) || null;
  const weight = weightFrom(p);
  const slug = await uniqueSlug(slugify(`cafe-kalango-${name}-${weight >= 1000 ? `${weight / 1000}kg` : `${weight}g`}`));
  const [{ pos }] = await db.select({ pos: max(schema.products.position) }).from(schema.products);
  const img = imageOf(p);
  const [row] = await db.insert(schema.products).values({
    slug,
    name,
    sku: p.codigo ?? null,
    priceCents: Math.round((p.preco ?? 0) * 100),
    weightGrams: weight,
    shortDescription: desc ? firstSentence(desc) : null,
    description: desc,
    story: extra,
    images: img ? [img] : [],
    stock: stockOf(p) ?? 0,
    active: p.situacao !== "I",
    position: (pos ?? 0) + 1,
    blingId: p.id,
    blingName: p.nome ?? null,
    blingSyncedAt: new Date(),
  }).returning();
  return row;
}

/** Café novo: precisa ser produto ativo, simples/pai, com preço e na categoria escolhida. */
function canCreate(p: BlingProduct, cafeCategoryId: number | null | undefined) {
  return Boolean(
    cafeCategoryId &&
      p.categoria?.id === cafeCategoryId &&
      p.situacao === "A" &&
      (p.tipo ?? "P") === "P" &&
      !p.idProdutoPai &&
      p.codigo &&
      (p.preco ?? 0) > 0
  );
}

async function findSiteProduct(p: BlingProduct) {
  const [byId] = await db.select().from(schema.products).where(eq(schema.products.blingId, p.id)).limit(1);
  if (byId) return byId;
  if (!p.codigo) return null;
  const [bySku] = await db.select().from(schema.products).where(eq(schema.products.sku, p.codigo)).limit(1);
  return bySku ?? null;
}

export type ApplyResult = "updated" | "unchanged" | "created" | "deactivated" | "ignored";

/** Aplica um produto do Bling ao site. `detail` busca foto/peso quando vai criar. */
export async function applyBlingProduct(
  p: BlingProduct,
  opts: { cafeCategoryId?: number | null; fetchDetail?: boolean } = {}
): Promise<{ result: ApplyResult; name: string | null }> {
  const [lifestyle] = await db.select().from(schema.merch).where(
    p.codigo ? or(eq(schema.merch.blingId, p.id), eq(schema.merch.sku, p.codigo)) : eq(schema.merch.blingId, p.id)
  ).limit(1);
  if (lifestyle) {
    if (publicationOpen(lifestyle)) return { result: "ignored", name: lifestyle.name };
    await db.update(schema.merch).set({
      blingId: p.id, blingSyncedAt: new Date(),
      ...(p.nome ? { name: p.nome } : {}),
      ...(typeof p.preco === "number" && p.preco > 0 ? { priceCents: Math.round(p.preco * 100) } : {}),
      ...(p.situacao ? { active: p.situacao === "A" } : {}),
      ...(stockOf(p) !== null ? { stock: stockOf(p)! } : {}),
      ...(p.descricaoCurta ? { description: htmlToText(p.descricaoCurta) } : {}),
    }).where(eq(schema.merch.id, lifestyle.id));
    return { result: p.situacao === "I" ? "deactivated" : "updated", name: p.nome ?? lifestyle.name };
  }
  const site = await findSiteProduct(p);
  if (site) {
    if (publicationOpen(site)) return { result: "ignored", name: site.name };
    const set = changesFor(site, p);
    if (Object.keys(set).length === 0) return { result: "unchanged", name: site.name };
    await db
      .update(schema.products)
      .set({ ...set, blingSyncedAt: new Date() })
      .where(eq(schema.products.id, site.id));
    const deactivated = set.active === false;
    return { result: deactivated ? "deactivated" : "updated", name: set.name ?? site.name };
  }
  if (!canCreate(p, opts.cafeCategoryId)) return { result: "ignored", name: null };
  let full = p;
  if (opts.fetchDetail !== false) {
    try {
      full = { ...p, ...(await blingFetch<{ data: BlingProduct }>(`/produtos/${p.id}`)).data };
      if (stockOf(full) === null) full.estoque = { saldoVirtualTotal: await fetchStock(p.id) };
    } catch (err) {
      console.error("[bling] detalhe do produto novo:", (err as Error).message);
    }
  }
  try {
    return { result: "created", name: (await createFromBling(full)).name };
  } catch (err) {
    // Corrida com outro webhook do mesmo produto: o outro já criou.
    if (/unique/i.test((err as Error).message)) return { result: "unchanged", name: null };
    throw err;
  }
}

async function fetchStock(blingId: number) {
  const r = await blingFetch<{ data: { produto: { id: number }; saldoVirtualTotal?: number }[] }>(
    "/estoques/saldos",
    { query: { "idsProdutos[]": [blingId] } }
  );
  return r.data?.[0]?.saldoVirtualTotal ?? 0;
}

/** Webhook de estoque: só traz o ID do Bling e o saldo novo. */
export async function applyStock(blingId: number, saldoVirtualTotal: number | undefined) {
  if (typeof saldoVirtualTotal !== "number" || !Number.isFinite(saldoVirtualTotal)) return "ignored";
  const stock = Math.max(0, Math.floor(saldoVirtualTotal));
  const r = await db
    .update(schema.products)
    .set({ stock, blingSyncedAt: new Date() })
    .where(and(eq(schema.products.blingId, blingId), publishedCoffee()))
    .returning({ id: schema.products.id });
  const m = await db.update(schema.merch).set({ stock, blingSyncedAt: new Date() })
    .where(and(eq(schema.merch.blingId, blingId), publishedMerch())).returning({ id: schema.merch.id });
  return r.length || m.length ? "updated" : "ignored";
}

export async function deactivateByBlingId(blingId: number) {
  const r = await db
    .update(schema.products)
    .set({ active: false, blingSyncedAt: new Date() })
    .where(and(eq(schema.products.blingId, blingId), publishedCoffee()))
    .returning({ id: schema.products.id });
  const m = await db.update(schema.merch).set({ active: false, blingSyncedAt: new Date() })
    .where(and(eq(schema.merch.blingId, blingId), publishedMerch())).returning({ id: schema.merch.id });
  return r.length || m.length ? "deactivated" : "ignored";
}

// ---------------------------------------------------------------- sincronização completa

export async function listAll(query: Record<string, string | number | (string | number)[] | undefined>) {
  const out: BlingProduct[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await blingFetch<{ data: BlingProduct[] }>("/produtos", {
      query: { ...query, pagina, limite: 100 },
    });
    out.push(...(r.data ?? []));
    if ((r.data ?? []).length < 100) break;
  }
  return out;
}

let running: Promise<schema.BlingSyncSummary> | null = null;

export function syncRunning() {
  return running !== null;
}

/** Puxa todos os cafés do Bling. Só uma por vez neste processo. */
export function syncFromBling(trigger: schema.BlingSyncSummary["trigger"]) {
  if (running) return running;
  running = doSync(trigger).finally(() => {
    running = null;
  });
  return running;
}

async function doSync(trigger: schema.BlingSyncSummary["trigger"]) {
  const conn = await getConnection();
  const summary: schema.BlingSyncSummary = {
    at: new Date().toISOString(),
    trigger,
    checked: 0,
    updated: [],
    created: [],
    deactivated: [],
    notFound: [],
    error: null,
  };
  try {
    if (!isConnected(conn)) throw new BlingError("Bling não conectado", { kind: "not_connected" });
    const site = await db.select().from(schema.products).where(isNotNull(schema.products.sku));
    const lifestyle = await db.select().from(schema.merch).where(isNotNull(schema.merch.sku));
    const skus = [...new Set([...site, ...lifestyle].map((s) => s.sku!).filter(Boolean))];

    const found = new Map<number, BlingProduct>();
    for (let i = 0; i < skus.length; i += 50) {
      for (const p of await listAll({ "codigos[]": skus.slice(i, i + 50), criterio: 5 })) found.set(p.id, p);
    }
    if (conn?.cafeCategoryId) {
      for (const p of await listAll({ idCategoria: conn.cafeCategoryId, criterio: 2 })) found.set(p.id, p);
    }

    const seenSkus = new Set([...found.values()].map((p) => p.codigo));
    summary.notFound = skus.filter((s) => !seenSkus.has(s));

    // Mesmo SKU duplicado no Bling (pai + excluído): o ativo ganha.
    const ordered = [...found.values()].sort((a, b) => (a.situacao === "A" ? 1 : 0) - (b.situacao === "A" ? 1 : 0));
    for (const p of ordered) {
      summary.checked++;
      const { result, name } = await applyBlingProduct(p, { cafeCategoryId: conn?.cafeCategoryId });
      const label = name ?? p.nome ?? String(p.id);
      if (result === "updated") summary.updated.push(label);
      if (result === "created") summary.created.push(label);
      if (result === "deactivated") summary.deactivated.push(label);
    }
  } catch (err) {
    summary.error = (err as Error).message.slice(0, 300);
  }
  await updateConnection({ lastSyncAt: new Date(), lastSyncSummary: summary });
  return summary;
}

const AUTO_EVERY_MS = 6 * 60 * 60_000;
let autoCheckedAt = 0;

/**
 * Chamado pelo catálogo (sem esperar): se a última sincronização tem mais de 6 h,
 * roda de novo e reenvia pedidos pendentes. Também mantém o refresh token vivo.
 */
export function maybeAutoSync(retryOrders?: () => Promise<unknown>) {
  if (Date.now() - autoCheckedAt < 60_000 || running) return;
  autoCheckedAt = Date.now();
  void (async () => {
    try {
      const conn = await getConnection();
      if (!isConnected(conn)) return;
      if (conn?.lastSyncAt && Date.now() - conn.lastSyncAt.getTime() < AUTO_EVERY_MS) return;
      await syncFromBling("auto");
      if (retryOrders) await retryOrders();
    } catch (err) {
      console.error("[bling] sincronização automática:", (err as Error).message);
    }
  })();
}

/** Produtos do site ligados ao Bling (para o painel). */
export async function linkedProducts() {
  const rows = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      sku: schema.products.sku,
      blingId: schema.products.blingId,
      priceCents: schema.products.priceCents,
      stock: schema.products.stock,
      active: schema.products.active,
      blingSyncedAt: schema.products.blingSyncedAt,
      publicationStatus: schema.products.publicationStatus,
    })
    .from(schema.products)
    .orderBy(schema.products.position);
  const lifestyle = await db.select({
    id: schema.merch.id, name: schema.merch.name, sku: schema.merch.sku,
    blingId: schema.merch.blingId, priceCents: schema.merch.priceCents, stock: schema.merch.stock,
    active: schema.merch.active, blingSyncedAt: schema.merch.blingSyncedAt,
    publicationStatus: schema.merch.publicationStatus,
  }).from(schema.merch).orderBy(schema.merch.position);
  return [
    ...rows.map((p) => ({ ...p, kind: "coffee" as const })),
    ...lifestyle.map((p) => ({ ...p, priceCents: p.priceCents ?? 0, kind: "merch" as const })),
  ];
}

export async function productsByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(schema.products).where(and(inArray(schema.products.id, ids)));
}

// ---------------------------------------------------------------- cadastro pelo painel

/**
 * Produtos ativos do Bling que ainda não estão no site — o "Novo café" do
 * painel escolhe daqui. Itens "Café Kalango" primeiro.
 */
export async function blingCandidates() {
  const site = await db.select({ blingId: schema.products.blingId, sku: schema.products.sku }).from(schema.products);
  const ids = new Set(site.map((s) => s.blingId).filter(Boolean));
  const skus = new Set(site.map((s) => s.sku).filter(Boolean));
  const all = await listAll({ criterio: 2 });
  return all
    .filter((p) => (p.tipo ?? "P") === "P" && !p.idProdutoPai && !ids.has(p.id) && !(p.codigo && skus.has(p.codigo)))
    .map((p) => ({
      id: p.id,
      nome: (p.nome ?? "").replace(/\s+/g, " ").trim(),
      codigo: p.codigo || null,
      precoCents: Math.round((p.preco ?? 0) * 100),
      pesoGramas: weightFrom(p),
      kalango: /kalango/i.test(p.nome ?? ""),
    }))
    .sort((a, b) => Number(b.kalango) - Number(a.kalango) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Traz um produto do Bling para o site (sem olhar a categoria). Devolve a linha criada. */
export async function importFromBling(blingId: number) {
  const full = (await blingFetch<{ data: BlingProduct }>(`/produtos/${blingId}`)).data;
  if (!full?.id) throw new BlingError("Produto não encontrado no Bling.", { kind: "not_found" });
  if (await findSiteProduct(full)) throw new BlingError("Esse produto já está no site.", { kind: "duplicate" });
  if (full.situacao !== "A") throw new BlingError("Produto inativo no Bling. Ative lá antes.", { kind: "inactive" });
  if (!full.codigo) throw new BlingError("Produto sem código (SKU) no Bling. Preencha lá antes: é ele que liga o site ao Bling.", { kind: "no_sku" });
  if (!((full.preco ?? 0) > 0)) throw new BlingError("Produto sem preço no Bling. Preencha lá antes.", { kind: "no_price" });
  if (stockOf(full) === null) {
    full.estoque = { saldoVirtualTotal: await fetchStock(full.id).catch(() => 0) };
  }
  return createFromBling(full);
}
