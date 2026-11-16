/**
 * Site → Bling: pedido pago vira pedido de venda, com o cliente como contato.
 *
 * - Pedido de teste nunca vai. Pedido não pago nunca vai.
 * - Idempotente: numeroLoja = referência KLG-…; antes de criar, procura no
 *   Bling por esse número. Um "claim" no banco impede envio duplo simultâneo.
 * - Os números KLG-… não colidem com os do WooCommerce no mesmo Bling.
 * - O site não lança estoque nem nota: o tio segue o fluxo dele no Bling
 *   (emitir NF a partir do pedido), igual aos pedidos do WooCommerce.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { BlingError, blingFetch, getConnection, isConnected } from "./bling-client";

type Order = schema.Order;
const MAX_AUTO_ATTEMPTS = 5;
const STALE_SENDING_MS = 5 * 60_000;

const reais = (cents: number) => Math.round(cents) / 100;
const digits = (v: string) => v.replace(/\D/g, "");

/** Data no fuso de Brasília, YYYY-MM-DD. */
export function dateBR(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type ContatoBody = Record<string, unknown>;

export function contatoBody(order: Order): ContatoBody {
  const doc = digits(order.document);
  const phone = digits(order.phone);
  return {
    nome: order.customerName.trim(),
    situacao: "A",
    tipo: doc.length === 14 ? "J" : "F",
    numeroDocumento: doc,
    indicadorIe: 9,
    email: order.email,
    emailNotaFiscal: order.email,
    ...(phone.length >= 10 ? { celular: phone } : {}),
    endereco: {
      geral: {
        endereco: order.street,
        numero: order.number,
        complemento: order.complement ?? "",
        bairro: order.district,
        cep: digits(order.zip),
        municipio: order.city,
        uf: order.state.toUpperCase(),
      },
    },
  };
}

/** Reaproveita o contato pelo CPF/CNPJ (o cliente pode já existir pelo WooCommerce). */
async function ensureContato(order: Order) {
  const doc = digits(order.document);
  if (doc.length === 11 || doc.length === 14) {
    const found = await blingFetch<{ data: { id: number }[] }>("/contatos", {
      query: { numeroDocumento: doc, criterio: 1, limite: 1 },
    });
    if (found.data?.[0]?.id) return found.data[0].id;
  }
  const created = await blingFetch<{ data: { id: number } }>("/contatos", {
    method: "POST",
    body: contatoBody(order),
  });
  return created.data.id;
}

export function pedidoBody(
  order: Order,
  items: (schema.OrderItem & { sku: string | null; blingId: number | null })[],
  opts: { contatoId: number; lojaId?: number | null; formaPagamentoId?: number | null }
) {
  const date = dateBR(order.paidAt ?? order.createdAt);
  const discountCents = order.subtotalCents + order.shippingCents - order.totalCents;
  return {
    numeroLoja: order.reference,
    data: date,
    dataSaida: date,
    contato: { id: opts.contatoId },
    ...(opts.lojaId ? { loja: { id: opts.lojaId } } : {}),
    itens: items.map((i) => ({
      ...(i.sku ? { codigo: i.sku } : {}),
      ...(i.blingId ? { produto: { id: i.blingId } } : {}),
      descricao: `${i.name} — ${i.grind}`.slice(0, 120),
      unidade: "UN",
      quantidade: i.quantity,
      valor: reais(i.unitCents),
    })),
    ...(discountCents > 0 ? { desconto: { valor: reais(discountCents), unidade: "REAL" } } : {}),
    ...(opts.formaPagamentoId
      ? {
        parcelas: [
          {
            dataVencimento: date,
            valor: reais(order.totalCents),
            formaPagamento: { id: opts.formaPagamentoId },
            observacoes: order.mpPaymentId ? `Mercado Pago ${order.mpPaymentId}` : "Mercado Pago",
          },
        ],
      }
      : {}),
    transporte: {
      fretePorConta: 0,
      frete: reais(order.shippingCents),
      quantidadeVolumes: 1,
      etiqueta: {
        nome: order.customerName,
        endereco: order.street,
        numero: order.number,
        complemento: order.complement ?? "",
        municipio: order.city,
        uf: order.state.toUpperCase(),
        cep: digits(order.zip),
        bairro: order.district,
      },
      volumes: [{ servico: order.shippingMethod.slice(0, 60) }],
    },
    observacoes: [
      `Pedido ${order.reference} feito no site.`,
      order.mpPaymentId ? `Pago no Mercado Pago (pagamento ${order.mpPaymentId}).` : null,
      order.notes ? `Obs. do cliente: ${order.notes}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    observacoesInternas: "Origem: site Kalango (não é do WooCommerce). Moagem de cada item na descrição.",
  };
}

/** Marca o pedido como "enviando" — só um processo consegue. */
async function claim(orderId: number) {
  const stale = new Date(Date.now() - STALE_SENDING_MS);
  const won = await db
    .update(schema.orders)
    .set({
      blingStatus: "sending",
      blingAttemptAt: new Date(),
      blingAttempts: sql`coalesce(${schema.orders.blingAttempts}, 0) + 1`,
    })
    .where(
      and(
        eq(schema.orders.id, orderId),
        isNull(schema.orders.blingOrderId),
        isNotNull(schema.orders.paidAt),
        or(eq(schema.orders.isTest, false), isNull(schema.orders.isTest)),
        or(
          isNull(schema.orders.blingStatus),
          eq(schema.orders.blingStatus, "error"),
          and(eq(schema.orders.blingStatus, "sending"), lt(schema.orders.blingAttemptAt, stale))
        )
      )
    )
    .returning();
  return won[0] ?? null;
}

export type PushResult =
  | { ok: true; blingOrderId: string; numero: string | null; existed: boolean }
  | { ok: false; reason: string };

export async function pushOrderToBling(orderId: number): Promise<PushResult> {
  const [current] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!current) return { ok: false, reason: "Pedido não encontrado" };
  if (current.isTest) return { ok: false, reason: "Pedido de teste não vai para o Bling" };
  if (!current.paidAt) return { ok: false, reason: "Pedido ainda não foi pago" };
  if (current.blingOrderId) {
    return { ok: true, blingOrderId: current.blingOrderId, numero: current.blingOrderNumber, existed: true };
  }

  const conn = await getConnection();
  if (!isConnected(conn)) return { ok: false, reason: "Bling não conectado" };

  const order = await claim(orderId);
  if (!order) return { ok: false, reason: "Envio já em andamento" };

  try {
    // Já existe? (envio anterior que caiu antes de gravar a resposta)
    const existing = await blingFetch<{ data: { id: number; numero?: number }[] }>("/pedidos/vendas", {
      query: {
        "numerosLojas[]": [order.reference],
        ...(conn?.lojaId ? { idLoja: conn.lojaId } : {}),
      },
    });
    let id: number;
    let numero: number | null = null;
    let existed = false;
    if (existing.data?.[0]?.id) {
      id = existing.data[0].id;
      numero = existing.data[0].numero ?? null;
      existed = true;
    } else {
      const contatoId = await ensureContato(order);
      const items = await db
        .select({
          item: schema.orderItems,
          sku: schema.products.sku,
          blingId: schema.products.blingId,
        })
        .from(schema.orderItems)
        .leftJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
        .where(eq(schema.orderItems.orderId, order.id));
      const body = pedidoBody(
        order,
        items.map((r) => ({ ...r.item, sku: r.sku, blingId: r.blingId })),
        { contatoId, lojaId: conn?.lojaId, formaPagamentoId: conn?.formaPagamentoId }
      );
      const created = await blingFetch<{ data: { id: number } }>("/pedidos/vendas", {
        method: "POST",
        body,
      });
      id = created.data.id;
      try {
        const full = await blingFetch<{ data: { numero?: number } }>(`/pedidos/vendas/${id}`);
        numero = full.data?.numero ?? null;
      } catch {
        // Número é só exibição; o ID já garante o vínculo.
      }
    }
    await db
      .update(schema.orders)
      .set({
        blingOrderId: String(id),
        blingOrderNumber: numero != null ? String(numero) : null,
        blingStatus: "sent",
        blingError: null,
      })
      .where(eq(schema.orders.id, order.id));
    return { ok: true, blingOrderId: String(id), numero: numero != null ? String(numero) : null, existed };
  } catch (err) {
    const message =
      err instanceof BlingError ? err.message : `Erro inesperado: ${(err as Error).message}`;
    console.error(`[bling] pedido ${order.reference}: ${message}`);
    await db
      .update(schema.orders)
      .set({ blingStatus: "error", blingError: message.slice(0, 400) })
      .where(eq(schema.orders.id, order.id));
    return { ok: false, reason: message };
  }
}

/** Depois do pagamento aprovado — não segura o webhook do Mercado Pago. */
export function queueOrderPush(order: Order) {
  if (order.isTest || !order.paidAt) return;
  void (async () => {
    const conn = await getConnection();
    if (!isConnected(conn) || !conn?.ordersSince) return;
    if (order.paidAt! < conn.ordersSince) return;
    await pushOrderToBling(order.id);
  })().catch((err) => console.error("[bling] fila do pedido:", (err as Error).message));
}

/** Reenvia pedidos pagos que ficaram para trás (sem conexão, erro do Bling…). */
export async function retryPendingOrders() {
  const conn = await getConnection();
  if (!isConnected(conn) || !conn?.ordersSince) return 0;
  const rows = await db
    .select({ id: schema.orders.id, attempts: schema.orders.blingAttempts })
    .from(schema.orders)
    .where(
      and(
        isNull(schema.orders.blingOrderId),
        isNotNull(schema.orders.paidAt),
        gte(schema.orders.paidAt, conn.ordersSince),
        or(eq(schema.orders.isTest, false), isNull(schema.orders.isTest)),
        ne(schema.orders.status, "cancelled"),
        or(isNull(schema.orders.blingStatus), inArray(schema.orders.blingStatus, ["error", "sending"]))
      )
    )
    .limit(20);
  let sent = 0;
  for (const r of rows) {
    if ((r.attempts ?? 0) >= MAX_AUTO_ATTEMPTS) continue;
    if ((await pushOrderToBling(r.id)).ok) sent++;
  }
  return sent;
}
