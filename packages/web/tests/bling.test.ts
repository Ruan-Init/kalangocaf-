import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import "./mp-mock";
import { bmock, calls, resetBling } from "./bling-mock";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import app from "../src/api/index";
import { catalog } from "../src/api/routes/catalog";
import { bling } from "../src/api/routes/bling";
import { db } from "../src/api/database";
import * as schema from "../src/api/database/schema";
import {
  checkState,
  disconnect,
  getConnection,
  newState,
  seal,
  signBlingBody,
  unseal,
  updateConnection,
} from "../src/api/services/bling-client";
import { displayName, htmlToText, syncFromBling } from "../src/api/services/bling-sync";
import { pushOrderToBling, retryPendingOrders } from "../src/api/services/bling-orders";

const ctx = { context: { headers: new Headers() } };
const TOKEN = "ops-teste";
const SECRET = "bling-segredo-teste";

async function connect() {
  const res = await app.request(`/api/bling/callback?code=code-ok&state=${encodeURIComponent(newState())}`);
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toContain("bling=conectado");
  // Espera a sincronização disparada pelo callback.
  for (let i = 0; i < 50 && (await getConnection())?.lastSyncAt == null; i++) await Bun.sleep(10);
}

async function product(sku: string) {
  const [p] = await db.select().from(schema.products).where(eq(schema.products.sku, sku));
  return p;
}

let refSeq = 0;
async function paidOrder(over: Partial<typeof schema.orders.$inferInsert> = {}) {
  const reference = `KLG-BLING${++refSeq}`;
  const [o] = await db
    .insert(schema.orders)
    .values({
      reference,
      status: "paid",
      customerName: "Maria Cliente",
      email: "maria@example.com",
      phone: "(61) 99999-0000",
      document: "123.456.789-09",
      zip: "71503-503",
      street: "Rua das Flores",
      number: "10",
      district: "Asa Norte",
      city: "Brasília",
      state: "df",
      shippingMethod: "PAC",
      shippingCents: 2500,
      subtotalCents: 19000,
      totalCents: 21500,
      paidAt: new Date(),
      mpPaymentId: "123456",
      ...over,
    })
    .returning();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.sku, "B-001"));
  await db.insert(schema.orderItems).values({
    orderId: o.id,
    productId: p.id,
    name: p.name,
    grind: "Moído médio",
    quantity: 2,
    unitCents: 9500,
  });
  return o;
}

function webhook(body: unknown, sign = true) {
  const raw = JSON.stringify(body);
  return app.request("/api/webhooks/bling", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sign ? { "x-bling-signature-256": signBlingBody(raw, SECRET) } : {}),
    },
    body: raw,
  });
}

beforeAll(async () => {
  process.env.OPS_TOKEN = TOKEN;
  await db.insert(schema.products).values([
    { slug: "b-doce", name: "Doce", sku: "B-001", priceCents: 6990, stock: 50, images: ["/images/products/doce.jpg"], description: "Texto do site", position: 1 },
    { slug: "b-alq", name: "Alquimia", sku: "B-002", priceCents: 9500, stock: 50, position: 2 },
    { slug: "b-sem", name: "Sem Bling", sku: "B-404", priceCents: 9000, stock: 5, position: 3 },
  ]);
});

beforeEach(() => resetBling());

afterAll(async () => {
  // Os testes do Mercado Pago rodam depois no mesmo processo: sem conexão ativa.
  await disconnect();
});

describe("utilitários", () => {
  test("state do OAuth é assinado e expira", () => {
    const s = newState();
    expect(checkState(s)).toBe(true);
    expect(checkState(s.slice(0, -2) + "xx")).toBe(false);
    expect(checkState(newState(Date.now() - 11 * 60_000))).toBe(false);
    expect(checkState(null)).toBe(false);
  });

  test("tokens cifrados abrem só com o mesmo segredo", () => {
    const sealed = seal("meu-token");
    expect(sealed).not.toContain("meu-token");
    expect(unseal(sealed)).toBe("meu-token");
    expect(unseal("v1.lixo.lixo.lixo")).toBeNull();
  });

  test("nome e descrição do Bling", () => {
    expect(displayName("Café Kalango Doce Cerrado 250g")).toBe("Doce Cerrado");
    expect(displayName("CAFÉ KALANGO - Arara Roxa - 250 g")).toBe("Arara Roxa");
    expect(displayName("Alquimia")).toBe("Alquimia");
    expect(htmlToText("<p>Notas de <strong>caramelo</strong> &amp; mel.</p><p>Torra média.</p>")).toBe(
      "Notas de caramelo & mel.\n\nTorra média."
    );
  });
});

describe("conexão", () => {
  test("callback com state inválido não troca token", async () => {
    const res = await app.request("/api/bling/callback?code=code-ok&state=forjado.123.abc");
    expect(res.headers.get("location")).toContain("bling=erro");
    expect(calls("POST /oauth/token")).toHaveLength(0);
  });

  test("callback válido guarda tokens cifrados, empresa e sincroniza", async () => {
    bmock.products.set(1, { id: 1, codigo: "B-001", nome: "Café Kalango Doce 250g", preco: 72.9, situacao: "A", descricaoCurta: "<p>Do Bling.</p>", estoque: { saldoVirtualTotal: 12.6 } });
    await connect();
    const tokenCall = calls("POST /oauth/token")[0];
    expect(tokenCall.headers.get("enable-jwt")).toBe("1");
    const conn = await getConnection();
    expect(conn?.companyId).toBe("empresa-kalango");
    expect(conn?.ordersSince).toBeInstanceOf(Date);
    expect(conn?.accessTokenEnc).not.toContain("jwt-access");
    expect(conn?.refreshTokenEnc).not.toContain("refresh-");
    const status = await call(bling.status, { token: TOKEN }, ctx);
    expect(status.connected).toBe(true);
    expect(JSON.stringify(status)).not.toContain("jwt-access");
    expect(status.redirectUrl).toBe("https://loja.example.test/api/bling/callback");
  });

  test("status exige a senha do painel", async () => {
    await expect(call(bling.status, { token: "errada" }, ctx)).rejects.toThrow();
  });
});

describe("sincronização Bling → site", () => {
  test("atualiza por SKU, preserva fotos locais, desativa e cria café da categoria", async () => {
    await updateConnection({ cafeCategoryId: 55 });
    bmock.products.set(1, { id: 1, codigo: "B-001", nome: "Café Kalango Doce Cerrado 250g", preco: 74.9, situacao: "A", descricaoCurta: "<p>Novo texto.</p>", imagemURL: "https://cdn.bling/x.jpg", estoque: { saldoVirtualTotal: 7 } });
    bmock.products.set(2, { id: 2, codigo: "B-002", nome: "Alquimia", preco: 95, situacao: "I", estoque: { saldoVirtualTotal: 0 } });
    bmock.products.set(3, { id: 3, codigo: "B-NEW", nome: "Café Kalango Bourbon Amarelo 250g", preco: 88, situacao: "A", tipo: "P", categoria: { id: 55 }, descricaoCurta: "<p>Doce e floral, com final de mel. Torra clara.</p>", descricaoComplementar: "Sítio X", pesoLiquido: 0.25, estoque: { saldoVirtualTotal: 20 }, midia: { imagens: { externas: [{ link: "https://cdn.example/bourbon.jpg" }] } } });
    bmock.products.set(4, { id: 4, codigo: "CAN-1", nome: "Caneca", preco: 60, situacao: "A", tipo: "P", categoria: { id: 99 } });

    const s = await syncFromBling("manual");
    expect(s.error).toBeNull();
    expect(s.notFound).toEqual(["B-404"]);
    expect(s.created).toEqual(["Bourbon Amarelo"]);
    expect(s.deactivated).toEqual(["Alquimia"]);

    const doce = await product("B-001");
    expect(doce.name).toBe("Doce Cerrado");
    expect(doce.blingName).toBe("Café Kalango Doce Cerrado 250g");
    expect(doce.priceCents).toBe(7490);
    expect(doce.stock).toBe(7);
    expect(doce.description).toBe("Novo texto.");
    expect(doce.images).toEqual(["/images/products/doce.jpg"]);
    expect(doce.blingId).toBe(1);

    const novo = await product("B-NEW");
    expect(novo.slug).toBe("cafe-kalango-bourbon-amarelo-250g");
    expect(novo.images).toEqual(["https://cdn.example/bourbon.jpg"]);
    expect(novo.story).toBe("Sítio X");
    expect(novo.shortDescription).toBe("Doce e floral, com final de mel.");
    expect(novo.stock).toBe(20);
    expect(await product("CAN-1")).toBeUndefined();

    const list = await call(catalog.list, undefined, ctx);
    expect(list.some((p) => p.sku === "B-002")).toBe(false);
    expect(list.some((p) => p.sku === "B-NEW")).toBe(true);
    // Desativado não é comprável, mas o link antigo continua abrindo.
    expect((await call(catalog.get, { slug: "b-alq" }, ctx)).active).toBe(false);

    // Segunda rodada sem mudanças não escreve nada.
    const again = await syncFromBling("manual");
    expect(again.updated).toEqual([]);
    expect(again.created).toEqual([]);
    expect(calls("POST")).toHaveLength(0);
  });

  test("access expirado renova com refresh rotativo; refresh recusado pede reconexão", async () => {
    await updateConnection({ accessExpiresAt: new Date(Date.now() - 1000) });
    await syncFromBling("manual");
    expect(calls("POST /oauth/token")).toHaveLength(1);
    expect(calls("POST /oauth/token")[0].body).toContain("grant_type=refresh_token");

    bmock.validAccess.clear(); // 401 → tenta renovar uma vez
    bmock.refreshFails = true;
    const s = await syncFromBling("manual");
    expect(s.error).toMatch(/token/i);
    const conn = await getConnection();
    expect(conn?.needsReconnect).toBe(true);
    // Reconecta para os próximos testes.
    bmock.refreshFails = false;
    await connect();
    expect((await getConnection())?.needsReconnect).toBe(false);
  });

  test("429 espera e tenta de novo", async () => {
    bmock.failNext.set("GET /produtos", [429]);
    const s = await syncFromBling("manual");
    expect(s.error).toBeNull();
    expect(calls("GET /produtos").length).toBeGreaterThanOrEqual(2);
  });
});

describe("webhook", () => {
  const base = { date: "2026-10-17T12:00:00Z", version: "v1", companyId: "empresa-kalango" };

  test("sem assinatura válida → 401", async () => {
    const res = await webhook({ ...base, eventId: "e0", event: "stock.updated", data: {} }, false);
    expect(res.status).toBe(401);
  });

  test("estoque atualiza pelo ID do Bling e evento repetido não reprocessa", async () => {
    const body = { ...base, eventId: "e1", event: "stock.updated", data: { produto: { id: 1 }, saldoFisicoTotal: 3, saldoVirtualTotal: 3 } };
    const r1 = await webhook(body);
    expect(r1.status).toBe(200);
    expect((await r1.json()).outcome).toBe("updated");
    expect((await product("B-001")).stock).toBe(3);
    await db.update(schema.products).set({ stock: 99 }).where(eq(schema.products.sku, "B-001"));
    const r2 = await webhook(body);
    expect((await r2.json()).outcome).toBe("duplicate");
    expect((await product("B-001")).stock).toBe(99);
  });

  test("outra empresa é ignorada; produto atualizado e excluído", async () => {
    const other = await webhook({ ...base, companyId: "outra", eventId: "e2", event: "stock.updated", data: { produto: { id: 1 }, saldoVirtualTotal: 0 } });
    expect((await other.json()).outcome).toBe("ignored_other_company");

    const upd = await webhook({ ...base, eventId: "e3", event: "product.updated", data: { id: 1, codigo: "B-001", nome: "Café Kalango Doce Cerrado 250g", preco: 79.9, situacao: "A", tipo: "P", formato: "S" } });
    expect((await upd.json()).outcome).toBe("updated");
    expect((await product("B-001")).priceCents).toBe(7990);

    const del = await webhook({ ...base, eventId: "e4", event: "product.deleted", data: { id: 3 } });
    expect((await del.json()).outcome).toBe("deactivated");
    expect((await product("B-NEW")).active).toBe(false);
  });
});

describe("pedido pago → Bling", () => {
  test("cria contato e pedido de venda uma vez só", async () => {
    await updateConnection({ formaPagamentoId: 77, lojaId: 66 });
    const o = await paidOrder();
    const r = await pushOrderToBling(o.id);
    expect(r.ok).toBe(true);
    expect(bmock.contatos).toHaveLength(1);
    expect(bmock.contatos[0].numeroDocumento).toBe("12345678909");
    expect(bmock.pedidos).toHaveLength(1);
    const body = bmock.pedidos[0].body as {
      numeroLoja: string; contato: { id: number }; loja: { id: number };
      itens: { codigo: string; produto: { id: number }; quantidade: number; valor: number; descricao: string }[];
      transporte: { frete: number; etiqueta: { uf: string; cep: string } };
      parcelas: { valor: number; formaPagamento: { id: number } }[];
    };
    expect(body.numeroLoja).toBe(o.reference);
    expect(body.contato.id).toBe(7000);
    expect(body.loja.id).toBe(66);
    expect(body.itens[0]).toMatchObject({ codigo: "B-001", produto: { id: 1 }, quantidade: 2, valor: 95 });
    expect(body.itens[0].descricao).toContain("Moído médio");
    expect(body.transporte.frete).toBe(25);
    expect(body.transporte.etiqueta).toMatchObject({ uf: "DF", cep: "71503503" });
    expect(body.parcelas[0]).toMatchObject({ valor: 215, formaPagamento: { id: 77 } });

    const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, o.id));
    expect(row.blingStatus).toBe("sent");
    expect(row.blingOrderId).toBe("9000");
    expect(row.blingOrderNumber).toBe("100");

    const again = await pushOrderToBling(o.id);
    expect(again.ok && again.existed).toBe(true);
    expect(calls("POST /pedidos/vendas")).toHaveLength(1);
  });

  test("cliente já cadastrado (ex.: WooCommerce) é reaproveitado pelo CPF", async () => {
    bmock.contatos.push({ id: 5555, numeroDocumento: "12345678909", body: {} });
    const o = await paidOrder();
    await pushOrderToBling(o.id);
    expect(calls("POST /contatos")).toHaveLength(0);
    expect((bmock.pedidos[0].body.contato as { id: number }).id).toBe(5555);
  });

  test("pedido que já existe no Bling só é vinculado", async () => {
    const o = await paidOrder();
    bmock.pedidos.push({ id: 4242, numero: 77, numeroLoja: o.reference, body: {} });
    const r = await pushOrderToBling(o.id);
    expect(r.ok && r.existed).toBe(true);
    expect(calls("POST /pedidos/vendas")).toHaveLength(0);
    const [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, o.id));
    expect(row.blingOrderId).toBe("4242");
  });

  test("teste e não pago nunca vão", async () => {
    const t = await paidOrder({ isTest: true });
    const n = await paidOrder({ paidAt: null, status: "pending_payment" });
    expect((await pushOrderToBling(t.id)).ok).toBe(false);
    expect((await pushOrderToBling(n.id)).ok).toBe(false);
    expect(bmock.requests).toHaveLength(0);
  });

  test("erro do Bling fica registrado e a fila reenvia; pedidos antigos ficam de fora", async () => {
    bmock.failNext.set("POST /pedidos/vendas", [400]);
    const o = await paidOrder();
    const r = await pushOrderToBling(o.id);
    expect(r.ok).toBe(false);
    let [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, o.id));
    expect(row.blingStatus).toBe("error");
    expect(row.blingError).toContain("400");

    const antigo = await paidOrder({ paidAt: new Date("2020-01-01") });
    const sent = await retryPendingOrders();
    expect(sent).toBe(1);
    [row] = await db.select().from(schema.orders).where(eq(schema.orders.id, o.id));
    expect(row.blingStatus).toBe("sent");
    const [old] = await db.select().from(schema.orders).where(eq(schema.orders.id, antigo.id));
    expect(old.blingOrderId).toBeNull();
  });

  test("envios simultâneos criam um pedido só", async () => {
    const o = await paidOrder();
    await Promise.all([pushOrderToBling(o.id), pushOrderToBling(o.id), pushOrderToBling(o.id)]);
    expect(calls("POST /pedidos/vendas")).toHaveLength(1);
  });

  test("painel lista opções do Bling", async () => {
    const opts = await call(bling.options, { token: TOKEN }, ctx);
    expect(opts.categorias).toEqual([{ id: 55, nome: "Cafés" }]);
    expect(opts.canais[0].id).toBe(66);
    expect(opts.formas[0].id).toBe(77);
  });
});
