import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import * as schema from "../src/api/database/schema";
import { newsletterSchemaSql } from "../src/api/database/newsletter-schema";

// Sem credenciais reais, dados reais ou chamadas ao ERP.
const sqlite = createClient({ url: ":memory:" });
const db = drizzle(sqlite, { schema });
await sqlite.executeMultiple(await Bun.file(new URL("./fixtures/schema.sql", import.meta.url)).text());
await sqlite.executeMultiple(newsletterSchemaSql);
mock.module("../src/api/database", () => ({ db }));
const realClient = await import("../src/api/services/bling-client");
const actualFetch = realClient.blingFetch;
const { BlingError } = realClient;
const previousEnv = { token: process.env.OPS_TOKEN, id: process.env.BLING_CLIENT_ID,
  secret: process.env.BLING_CLIENT_SECRET, throttle: process.env.BLING_THROTTLE_MS };
process.env.OPS_TOKEN = "ops-test-only";
process.env.BLING_CLIENT_ID = "id-test-only";
process.env.BLING_CLIENT_SECRET = "secret-test-only";
process.env.BLING_THROTTLE_MS = "0";

let connected = true;
let deposit: number | null = 7;
let productFailure: "none" | "lost" | "reject" | "empty" = "none";
let stockFailure: "none" | "lost" | "reject" = "none";
let queriedStock = 12;
let depositForbidden = false;
let erp = new Map<string, { id: number; codigo: string; situacao: string }>();
const requests: { path: string; init: any }[] = [];
const fakeFetch = async (path: string, init: any = {}) => {
  requests.push({ path, init });
  if (["/categorias/produtos", "/canais-venda", "/formas-pagamentos"].includes(path)) return { data: [] };
  if (path === "/depositos") {
    if (depositForbidden) throw new BlingError("Higher privileges required", { kind: "api", status: 403 });
    return { data: [{ id: 7, descricao: "Geral", situacao: 1, desconsiderarSaldo: false }] };
  }
  if (path === "/produtos" && init.method !== "POST") {
    const sku = init.query["codigos[]"][0];
    return { data: erp.has(sku) ? [erp.get(sku)] : [] };
  }
  if (path === "/produtos" && init.method === "POST") {
    expect(init.noRetry).toBe(true);
    expect(init.body).toMatchObject({ tipo: "P", formato: "S", unidade: "UN" });
    expect(init.body.estoque).toBeUndefined();
    if (productFailure === "reject") throw new BlingError("Sem permissão", { kind: "api", status: 403 });
    if (productFailure === "lost") throw new BlingError("Resposta perdida", { kind: "network" });
    if (productFailure === "empty") return {};
    const product = { id: 1000 + erp.size, codigo: init.body.codigo, situacao: "A" };
    erp.set(product.codigo, product);
    return { data: { id: product.id } };
  }
  if (path === "/estoques") {
    expect(init.noRetry).toBe(true);
    expect(init.body.operacao).toBe("B");
    if (stockFailure !== "none") throw new BlingError("Estoque não confirmado", {
      kind: stockFailure === "lost" ? "network" : "api", status: stockFailure === "reject" ? 403 : null,
    });
    return { data: { id: 55 } };
  }
  if (path.startsWith("/estoques/saldos/")) return { data: [{ produto: { id: init.query["idsProdutos[]"][0] }, saldoFisicoTotal: queriedStock }] };
  throw new Error(`Chamada não simulada: ${path}`);
};
mock.module("../src/api/services/bling-client", () => ({ ...realClient,
  blingFetch: fakeFetch,
  getConnection: async () => connected ? { refreshTokenEnc: "simulado", needsReconnect: false,
    initialDepositId: deposit, cafeCategoryId: 99, accessTokenEnc: realClient.seal("fake-access"),
    accessExpiresAt: new Date(Date.now() + 3600_000) } : null,
}));
const { admin } = await import("../src/api/routes/admin");
const { catalog } = await import("../src/api/routes/catalog");
const { orders } = await import("../src/api/routes/orders");
const { bling } = await import("../src/api/routes/bling");
const { publishToBling } = await import("../src/api/services/bling-publish");
const { applyBlingProduct, applyStock, deactivateByBlingId } = await import("../src/api/services/bling-sync");
const { sitemapXml, googleMerchantXml } = await import("../src/api/seo/feeds");
const token = "ops-test-only";
const context = { headers: new Headers() };
const coffee = () => ({
  creationKey: crypto.randomUUID(), name: "Café de teste", slug: "cafe-de-teste", priceCents: 4990,
  stock: 12, weightGrams: 250, description: "Descrição", active: true,
  shortDescription: null, story: null, variety: null, altitude: null, process: null,
  producer: null, origin: null, roast: null, aroma: null, flavor: null, acidity: null,
  bodyNote: null, finish: null, scaScore: 86.5, notes: ["Doce", "Chocolate"],
  images: ["/images/products/kalango-pacote-250g.png"], featured: false, position: 0,
});
const lifestyle = () => ({ creationKey: crypto.randomUUID(), name: "Boné de teste", slug: "bone-de-teste",
  category: "bone" as const, priceCents: 8990, released: false, published: true });
const saveCoffee = (item: ReturnType<typeof coffee> & { id?: number }, password = token) => call(admin.coffeeSave, { token: password, item }, { context });
const saveMerch = (item: ReturnType<typeof lifestyle> & { id?: number }) => call(admin.merchSave, { token, item }, { context });
const posts = (path: string) => requests.filter((r) => r.path === path && r.init.method === "POST");

beforeEach(async () => {
  await sqlite.executeMultiple("DELETE FROM order_emails; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM merch; DELETE FROM bling_connection;");
  connected = true; deposit = 7; productFailure = "none"; stockFailure = "none"; queriedStock = 12;
  depositForbidden = false;
  erp = new Map(); requests.length = 0;
});
afterAll(() => {
  const keys = { OPS_TOKEN: previousEnv.token, BLING_CLIENT_ID: previousEnv.id,
    BLING_CLIENT_SECRET: previousEnv.secret, BLING_THROTTLE_MS: previousEnv.throttle };
  for (const [key, value] of Object.entries(keys)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  sqlite.close();
});

test("novo café cria produto, inicializa estoque e salva link; repetição não duplica", async () => {
  const item = coffee();
  const row = await saveCoffee(item);
  expect(row).toMatchObject({ publicationStatus: "ready", blingId: 1000, initialDepositId: 7 });
  expect(row.sku).toStartWith("KG-CF-");
  expect(posts("/produtos")).toHaveLength(1);
  expect(posts("/produtos")[0].init.body).toMatchObject({ preco: 49.9, pesoLiquido: 0.25, categoria: { id: 99 } });
  expect(posts("/estoques")[0].init.body).toMatchObject({ produto: { id: 1000 }, deposito: { id: 7 }, quantidade: 12 });
  expect((await saveCoffee(item)).id).toBe(row.id);
  await publishToBling("coffee", row.id);
  expect(posts("/produtos")).toHaveLength(1); expect(posts("/estoques")).toHaveLength(1);
  expect(await call(catalog.get, { slug: item.slug }, { context })).toMatchObject({ id: row.id });
});

test("duas chamadas simultâneas do mesmo formulário não duplicam café nem Lifestyle", async () => {
  const item = coffee();
  const coffees = await Promise.all([saveCoffee(item), saveCoffee(item)]);
  expect(coffees[0].id).toBe(coffees[1].id);
  const merch = lifestyle();
  const rows = await Promise.all([saveMerch(merch), saveMerch(merch)]);
  expect(rows[0].id).toBe(rows[1].id);
  expect(posts("/produtos")).toHaveLength(2);
  expect(await db.select().from(schema.products)).toHaveLength(1);
  expect(await db.select().from(schema.merch)).toHaveLength(1);
});

test("Lifestyle em breve exige preço, cria produto simples com estoque zero", async () => {
  const item = lifestyle();
  await expect(saveMerch({ ...item, priceCents: null as any })).rejects.toBeDefined();
  await expect(saveMerch({ ...item, priceCents: 0 })).rejects.toBeDefined();
  const row = await saveMerch(item);
  expect(row).toMatchObject({ released: false, priceCents: 8990, publicationStatus: "ready", blingId: 1000 });
  expect(row.sku).toStartWith("KG-LS-"); expect(posts("/estoques")).toHaveLength(0);
  expect(posts("/produtos")[0].init.body.categoria).toBeUndefined();
  expect((await saveMerch(item)).id).toBe(row.id); expect(posts("/produtos")).toHaveLength(1);
});

test("desconectado salva rascunho, fora do catálogo, URL, feed e sitemap; pode retomar", async () => {
  connected = false;
  const item = coffee(); const row = await saveCoffee(item);
  expect(row.publicationStatus).toBe("error"); expect(row.publicationError).toContain("Conecte");
  expect(await call(catalog.list, undefined, { context })).toHaveLength(0);
  await expect(call(catalog.get, { slug: item.slug }, { context })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await sitemapXml()).not.toContain(item.slug); expect(await googleMerchantXml()).not.toContain(item.slug);
  const quote = await call(orders.quote, { items: [{ slug: item.slug, quantity: 1, grind: "Grãos" }], shippingServiceId: "retirada" }, { context });
  expect(quote.missing).toEqual([item.slug]); expect(quote.items).toHaveLength(0); expect(quote.subtotalCents).toBe(0);
  const merch = await saveMerch(lifestyle());
  expect(await call(catalog.merch, undefined, { context })).toHaveLength(0);
  expect(requests).toHaveLength(0);
  connected = true;
  expect((await publishToBling("coffee", row.id)).publicationStatus).toBe("ready");
  expect((await publishToBling("merch", merch.id)).publicationStatus).toBe("ready");
});

test("depósito ausente bloqueia POST; café com zero não exige depósito", async () => {
  deposit = null;
  const row = await saveCoffee(coffee());
  expect(row.publicationError).toContain("depósito"); expect(posts("/produtos")).toHaveLength(0);
  deposit = 8;
  const resumed = await publishToBling("coffee", row.id);
  expect(resumed.initialDepositId).toBe(8); expect(resumed.publicationStatus).toBe("ready");
  deposit = null;
  const zero = await saveCoffee({ ...coffee(), slug: "cafe-zero", stock: 0 });
  expect(zero.publicationStatus).toBe("ready"); expect(posts("/estoques")).toHaveLength(1);
});

test("POST ambíguo nunca repete; consulta pelo SKU recupera link mesmo após restart", async () => {
  productFailure = "lost";
  const row = await saveCoffee(coffee());
  expect(row.publicationStatus).toBe("uncertain"); expect(row.productAttempted).toBe(true);
  expect((await publishToBling("coffee", row.id)).publicationStatus).toBe("uncertain");
  expect(posts("/produtos")).toHaveLength(1);
  erp.set(row.sku!, { id: 7777, codigo: row.sku!, situacao: "A" });
  await db.update(schema.products).set({ publicationStatus: "publishing", publicationAttemptAt: new Date(Date.now() - 180_000) }).where(eq(schema.products.id, row.id));
  const recovered = await publishToBling("coffee", row.id);
  expect(recovered).toMatchObject({ blingId: 7777, publicationStatus: "ready" });
  expect(posts("/produtos")).toHaveLength(1);
});

test("POST sem ID é ambíguo; erro 403 permite corrigir e tentar de novo", async () => {
  productFailure = "empty";
  const empty = await saveMerch(lifestyle());
  expect(empty.publicationStatus).toBe("uncertain");
  await publishToBling("merch", empty.id); expect(posts("/produtos")).toHaveLength(1);
  productFailure = "reject";
  const rejected = await saveMerch({ ...lifestyle(), slug: "outro-bone" });
  expect(rejected.productAttempted).toBe(false); expect(rejected.publicationStatus).toBe("error");
  productFailure = "none";
  expect((await publishToBling("merch", rejected.id)).publicationStatus).toBe("ready");
});

test("falha do estoque conserva vínculo; não repete balanço ambíguo", async () => {
  stockFailure = "lost";
  const row = await saveCoffee(coffee());
  expect(row).toMatchObject({ blingId: 1000, publicationStatus: "stock_uncertain" });
  queriedStock = 0;
  expect((await publishToBling("coffee", row.id)).publicationStatus).toBe("stock_uncertain");
  queriedStock = 12;
  expect((await publishToBling("coffee", row.id)).publicationStatus).toBe("ready");
  expect(posts("/produtos")).toHaveLength(1); expect(posts("/estoques")).toHaveLength(1);
});

test("estoque recusado pode ser refeito no mesmo depósito, sem recriar produto", async () => {
  stockFailure = "reject";
  const row = await saveCoffee(coffee()); expect(row.stockAttempted).toBe(false);
  stockFailure = "none"; deposit = 88;
  const result = await publishToBling("coffee", row.id);
  expect(result.publicationStatus).toBe("ready"); expect(result.initialDepositId).toBe(7);
  expect(posts("/produtos")).toHaveLength(1); expect(posts("/estoques")).toHaveLength(2);
});

test("Lifestyle recebe sync sem virar café; rascunhos ignoram webhooks", async () => {
  const row = await saveMerch(lifestyle());
  await applyBlingProduct({ id: row.blingId!, codigo: row.sku!, nome: "Boné atualizado", preco: 99.9,
    situacao: "A", categoria: { id: 99 }, estoque: { saldoVirtualTotal: 4 } }, { cafeCategoryId: 99 });
  expect(await db.select().from(schema.products)).toHaveLength(0);
  expect((await db.select().from(schema.merch))[0]).toMatchObject({ name: "Boné atualizado", priceCents: 9990, stock: 4 });
  await applyStock(row.blingId!, 8); await deactivateByBlingId(row.blingId!);
  expect((await db.select().from(schema.merch))[0]).toMatchObject({ stock: 8, active: false });
  productFailure = "lost";
  const draft = await saveCoffee(coffee());
  await applyBlingProduct({ id: 999, codigo: draft.sku!, preco: 1, nome: "Não alterar", situacao: "A", categoria: { id: 99 } }, { cafeCategoryId: 99 });
  expect((await db.select().from(schema.products))[0]).toMatchObject({ name: "Café de teste", blingId: null, publicationStatus: "uncertain" });
});

test("autenticação, preço, slugs, preservação ERP, fotos e exclusão", async () => {
  const item = coffee();
  await expect(saveCoffee(item, "incorreto")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(saveCoffee({ ...item, priceCents: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(saveCoffee({ ...item, creationKey: undefined as any })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  const row = await saveCoffee(item);
  await expect(saveCoffee({ ...coffee() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  const linked = await saveCoffee({ ...item, id: row.id, name: "Não alterar", priceCents: 1, stock: 999, images: ["/nova.jpg"] });
  expect(linked).toMatchObject({ name: item.name, priceCents: 4990, stock: 12, images: ["/nova.jpg"] });
  await expect(saveCoffee({ ...item, id: 99999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db.insert(schema.orders).values({ id: 1, reference: "TEST-1", customerName: "Teste", email: "teste@example.invalid",
    phone: "11999999999", document: "00000000000", zip: "00000000", street: "Rua", number: "1",
    district: "Bairro", city: "Cidade", state: "SP", shippingMethod: "retirada", subtotalCents: 4990, totalCents: 4990 });
  await sqlite.execute({ sql: "INSERT INTO order_items (order_id, product_id, name, grind, quantity, unit_cents) VALUES (1, ?, 'Café', 'Grãos', 1, 4990)", args: [row.id] });
  await expect(call(admin.coffeeRemove, { token, id: row.id }, { context })).rejects.toMatchObject({ code: "CONFLICT" });
  await sqlite.execute("DELETE FROM order_items");
  expect(await call(admin.coffeeRemove, { token, id: row.id }, { context })).toEqual({ ok: true });
  await expect(call(admin.coffeeRemove, { token, id: row.id }, { context })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(call(admin.retryPublication, { token: "wrong", kind: "coffee", id: row.id }, { context })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const m = await saveMerch(lifestyle());
  expect(await call(admin.merchRemove, { token, id: m.id }, { context })).toEqual({ ok: true });
});

test("sem permissão de depósitos mantém demais opções e orienta reconexão", async () => {
  depositForbidden = true;
  const options = await call(bling.options, { token }, { context });
  expect(options.depositos).toHaveLength(0);
  expect(options.depositosWarning).toContain("403");
  expect(options.depositosWarning).toContain("reconecte");
  expect(options.categorias).toEqual([]);
  await expect(call(bling.options, { token: "wrong" }, { context })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("cliente real noRetry não repete POST em falha de rede, 500 ou 401", async () => {
  await db.insert(schema.blingConnection).values({ id: 1, accessTokenEnc: realClient.seal("fake-access"),
    refreshTokenEnc: realClient.seal("fake-refresh"), accessExpiresAt: new Date(Date.now() + 3600_000) });
  const original = globalThis.fetch;
  try {
    for (const mode of ["network", "500", "401"]) {
      let calls = 0;
      globalThis.fetch = (async () => { calls++; if (mode === "network") throw new Error("simulado");
        return new Response("{}", { status: Number(mode) }); }) as typeof fetch;
      await expect(actualFetch("/produtos", { method: "POST", noRetry: true, body: { nome: "Teste" } })).rejects.toBeDefined();
      expect(calls).toBe(1);
    }
  } finally { globalThis.fetch = original; }
});