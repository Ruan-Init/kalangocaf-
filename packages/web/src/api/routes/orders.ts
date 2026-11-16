import { ORPCError } from "@orpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { GRINDS } from "../config/grinds";
import { STORE } from "../config/store";
import { db } from "../database";
import * as schema from "../database/schema";
import {
  melhorEnvioReady,
  quoteShipping,
  resolveShipping,
  type ShippingQuoteItem,
} from "../services/melhor-envio";
import {
  assertSeller,
  assertOrderEnvironment,
  MAX_INSTALLMENTS,
  MercadoPagoError,
  mpEnv,
  orderEnvironmentMatches,
  paymentsConfigured,
} from "../services/mercadopago";
import {
  deriveAccessToken,
  emailTokenMatches,
  orderAccessReady,
  newReference,
  sha256,
  tokenMatches,
} from "../services/order-access";
import { ensurePreference, orderItems, reconcileOrder } from "../services/order-payments";

const FREE_SHIPPING_FROM = STORE.freeShippingFromCents;
/** Intervalo mínimo entre consultas ao Mercado Pago pedidas pelo navegador. */
const SYNC_MIN_INTERVAL_MS = 4_000;

const cartItem = z.object({
  slug: z.string().min(1).max(200),
  grind: z.enum(GRINDS).default("Grãos"),
  quantity: z.number().int().min(1).max(20),
});

const checkoutInput = z.object({
  /** Gerada pelo navegador por tentativa: duplo clique e reenvio devolvem o mesmo pedido. */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  customerName: z.string().trim().min(3).max(120),
  email: z.email().max(200),
  phone: z.string().trim().min(8).max(30),
  document: z.string().trim().min(11).max(20),
  zip: z.string().trim().min(8).max(9),
  street: z.string().trim().min(3).max(200),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(2),
  shippingServiceId: z.string().min(1).max(40),
  notes: z.string().max(1000).optional(),
  items: z.array(cartItem).min(1).max(30),
});

const orderAccess = z.object({
  reference: z.string().min(4).max(40),
  token: z.string().min(20).max(200),
});

type CartInput = z.infer<typeof cartItem>;
import { isPublished } from "../services/bling-publish";

type ProductRow = typeof schema.products.$inferSelect;

/**
 * Preço e estoque do carrinho, sempre do banco. Produto desconhecido não some
 * em silêncio: volta em `missing`. Estoque é conferido somando todas as
 * moagens do mesmo café.
 */
async function priceCart(items: CartInput[]) {
  const slugs = [...new Set(items.map((i) => i.slug))];
  const rows = slugs.length
    ? await db.select().from(schema.products).where(inArray(schema.products.slug, slugs))
    : [];
  // Café desativado no Bling conta como inexistente (não dá pra comprar).
  const bySlug = new Map(rows.filter((r) => r.active && isPublished(r)).map((r) => [r.slug, r]));
  const missing = slugs.filter((s) => !bySlug.has(s));

  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.slug, (totals.get(i.slug) ?? 0) + i.quantity);
  const outOfStock = [...totals.entries()]
    .filter(([slug, qty]) => {
      const p = bySlug.get(slug);
      return p ? qty > p.stock : false;
    })
    .map(([slug]) => bySlug.get(slug)!.name);

  const lines = items.flatMap((i) => {
    const p = bySlug.get(i.slug);
    return p ? [{ product: p, grind: i.grind, quantity: i.quantity }] : [];
  });
  return { lines, missing, outOfStock };
}

function parcelsOf(lines: { product: ProductRow; quantity: number }[]): ShippingQuoteItem[] {
  return lines.map((l) => ({
    priceCents: l.product.priceCents,
    quantity: l.quantity,
    weightGrams: l.product.weightGrams,
  }));
}

function fingerprint(input: z.infer<typeof checkoutInput>) {
  const { idempotencyKey: _k, ...rest } = input;
  return sha256(JSON.stringify(rest));
}

function paymentsUnavailable(): never {
  throw new ORPCError("SERVICE_UNAVAILABLE", {
    message: "Pagamento online indisponível no momento. Fale com a gente pelo WhatsApp.",
  });
}

async function requirePayments() {
  if (!paymentsConfigured() || !orderAccessReady()) paymentsUnavailable();
  try {
    await assertSeller();
  } catch (err) {
    console.error("[orders] pagamento bloqueado:", (err as Error).message);
    paymentsUnavailable();
  }
}

async function loadOrderWithAccess(reference: string, token: string) {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.reference, reference))
    .limit(1);
  // Mesmo erro para "não existe" e "token errado": código de pedido sozinho não revela nada.
  if (!order || (!tokenMatches(token, order.accessTokenHash) && !emailTokenMatches(token, order.reference))) {
    throw new ORPCError("NOT_FOUND", { message: "Pedido não encontrado" });
  }
  return order;
}

const FRIENDLY_PAYMENT_ERROR =
  "Não conseguimos abrir o pagamento agora. Seu pedido está salvo — tente de novo em instantes.";

/** O que o comprador vê do próprio pedido (sem hashes, IDs internos ou CPF completo). */
async function publicOrder(order: schema.Order) {
  const items = await orderItems(order.id);
  const productIds = items.map((i) => i.productId).filter((id): id is number => id != null);
  const products = productIds.length
    ? await db
      .select({ id: schema.products.id, slug: schema.products.slug })
      .from(schema.products)
      .where(inArray(schema.products.id, productIds))
    : [];
  const slugOf = new Map(products.map((p) => [p.id, p.slug]));
  const digits = order.document.replace(/\D/g, "");
  return {
    reference: order.reference,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentStatusDetail: order.paymentStatusDetail,
    paymentError: order.paymentStatus === "preference_error" ? FRIENDLY_PAYMENT_ERROR : null,
    isTest: Boolean(order.isTest),
    paid: order.paidAt != null,
    paidAt: order.paidAt,
    canPay: order.paidAt == null && order.status === "pending_payment" &&
      paymentsConfigured() && orderAccessReady() && orderEnvironmentMatches(order),
    customerName: order.customerName,
    email: order.email,
    documentMasked: digits.length >= 4 ? `•••${digits.slice(-2)}` : "",
    zip: order.zip,
    street: order.street,
    number: order.number,
    complement: order.complement,
    district: order.district,
    city: order.city,
    state: order.state,
    shippingMethod: order.shippingMethod,
    shippingTrackingCode: order.shippingTrackingCode,
    shippingCents: order.shippingCents,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    items: items.map((i) => ({
      id: i.id,
      slug: i.productId != null ? (slugOf.get(i.productId) ?? null) : null,
      name: i.name,
      grind: i.grind,
      quantity: i.quantity,
      unitCents: i.unitCents,
    })),
  };
}

export const orders = {
  /** O que o checkout precisa saber do pagamento (sem segredo nenhum). */
  paymentConfig: base.handler(async () => {
    let env: ReturnType<typeof mpEnv> = "disabled";
    if (paymentsConfigured() && orderAccessReady()) {
      try {
        await assertSeller();
        env = mpEnv();
      } catch {
        // Não revela detalhes de credenciais ao comprador.
      }
    }
    return { env, maxInstallments: MAX_INSTALLMENTS };
  }),

  /** Cotação de frete pro CEP informado. Sem CEP válido, devolve a estimativa. */
  shippingOptions: base
    .input(z.object({ zip: z.string().default(""), items: z.array(cartItem).max(30).default([]) }))
    .handler(async ({ input }) => {
      const { lines } = await priceCart(input.items);
      const { options, source } = await quoteShipping(input.zip, parcelsOf(lines));
      return {
        options,
        source,
        live: melhorEnvioReady,
        freeFrom: FREE_SHIPPING_FROM,
      };
    }),

  /** Recalcula o carrinho no servidor — o preço nunca vem do cliente. */
  quote: base
    .input(z.object({
      items: z.array(cartItem).max(30),
      zip: z.string().default(""),
      shippingServiceId: z.string().default(""),
    }))
    .handler(async ({ input }) => {
      if (input.items.length === 0) {
        return {
          items: [],
          missing: [] as string[],
          outOfStock: [] as string[],
          subtotalCents: 0,
          shippingCents: 0,
          totalCents: 0,
          shippingLabel: null as string | null,
        };
      }
      const { lines, missing, outOfStock } = await priceCart(input.items);
      const items = lines.map((l) => ({
        slug: l.product.slug,
        productId: l.product.id,
        name: l.product.name,
        grind: l.grind,
        quantity: l.quantity,
        unitCents: l.product.priceCents,
        lineCents: l.product.priceCents * l.quantity,
        weightGrams: l.product.weightGrams,
        image: l.product.images[0] ?? null,
      }));
      const subtotalCents = items.reduce((s, i) => s + i.lineCents, 0);
      const opt = await resolveShipping(input.zip, parcelsOf(lines), input.shippingServiceId);
      return {
        items,
        missing,
        outOfStock,
        subtotalCents,
        shippingCents: opt.cents,
        totalCents: subtotalCents + opt.cents,
        shippingLabel: opt.label,
      };
    }),

  /**
   * Cria o pedido (ou devolve o mesmo, se a chave de idempotência já foi usada)
   * e a preference do Checkout Pro no ambiente explicitamente configurado.
   */
  create: base.input(checkoutInput).handler(async ({ input }) => {
    await requirePayments();

    const idempotencyHash = sha256(input.idempotencyKey);
    const requestFingerprint = fingerprint(input);

    const findByKey = async () => {
      const [row] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.idempotencyHash, idempotencyHash))
        .limit(1);
      return row ?? null;
    };

    let order = await findByKey();
    if (order && order.requestFingerprint !== requestFingerprint) {
      throw new ORPCError("CONFLICT", {
        message: "Esse envio já foi usado com outro carrinho. Recarregue a página e tente de novo.",
      });
    }

    if (!order) {
      const { lines, missing, outOfStock } = await priceCart(input.items);
      if (missing.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Um item do carrinho não está mais disponível. Remova-o e tente de novo.",
        });
      }
      if (outOfStock.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Estoque insuficiente: ${outOfStock.join(", ")}.`,
        });
      }

      const subtotalCents = lines.reduce((s, l) => s + l.product.priceCents * l.quantity, 0);
      const opt = await resolveShipping(input.zip, parcelsOf(lines), input.shippingServiceId);
      if (opt.id !== input.shippingServiceId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A opção de frete mudou. Confira o frete e confirme de novo.",
        });
      }
      const reference = newReference();
      const accessToken = deriveAccessToken(reference, input.idempotencyKey);

      try {
        // batch = uma única transação atômica no libSQL/Turso, sem intercalar com outra
        // requisição. Os itens apontam para o pedido via subconsulta pela referência.
        const orderIdOf = sql`(select ${schema.orders.id} from ${schema.orders} where ${schema.orders.reference} = ${reference})`;
        const [[created]] = await db.batch([
          db
            .insert(schema.orders)
            .values({
              reference,
              status: "pending_payment",
              customerName: input.customerName,
              email: input.email,
              phone: input.phone,
              document: input.document,
              zip: input.zip,
              street: input.street,
              number: input.number,
              complement: input.complement,
              district: input.district,
              city: input.city,
              state: input.state.toUpperCase(),
              shippingMethod: opt.label,
              shippingServiceId: opt.id,
              shippingCents: opt.cents,
              subtotalCents,
              totalCents: subtotalCents + opt.cents,
              notes: input.notes,
              idempotencyHash,
              requestFingerprint,
              accessTokenHash: sha256(accessToken),
              isTest: mpEnv() === "test",
              paymentStatus: "awaiting",
            })
            .returning(),
          db.insert(schema.orderItems).values(
            lines.map((l) => ({
              orderId: orderIdOf,
              productId: l.product.id,
              name: l.product.name,
              grind: l.grind,
              quantity: l.quantity,
              unitCents: l.product.priceCents,
            }))
          ),
        ]);
        order = created;
      } catch (err) {
        // Corrida de duplo clique: a outra requisição gravou primeiro com a mesma chave.
        const existing = await findByKey();
        if (!existing) throw err;
        order = existing;
      }
    }

    assertOrderEnvironment(order);
    const accessToken = deriveAccessToken(order.reference, input.idempotencyKey);
    const pay = await ensurePreference(order, accessToken);
    return {
      reference: order.reference,
      accessToken,
      totalCents: order.totalCents,
      checkoutUrl: pay.checkoutUrl,
      paymentError: pay.error,
      alreadyPaid: pay.alreadyPaid,
    };
  }),

  /** Pedido para a página de retorno — exige o token que veio no link. */
  get: base.input(orderAccess).handler(async ({ input }) => {
    const order = await loadOrderWithAccess(input.reference, input.token);
    return publicOrder(order);
  }),

  /** Retoma o pagamento de um pedido ainda não pago, reaproveitando a preference. */
  resumePayment: base.input(orderAccess).handler(async ({ input }) => {
    const order = await loadOrderWithAccess(input.reference, input.token);
    if (order.paidAt) return { checkoutUrl: null, alreadyPaid: true, error: null };
    if (order.status !== "pending_payment") {
      throw new ORPCError("BAD_REQUEST", { message: "Este pedido não aceita novo pagamento." });
    }
    assertOrderEnvironment(order);
    await requirePayments();
    const pay = await ensurePreference(order, input.token);
    return { checkoutUrl: pay.checkoutUrl, alreadyPaid: pay.alreadyPaid, error: pay.error };
  }),

  /**
   * Confere no Mercado Pago a situação do pagamento (retorno do checkout).
   * Parâmetros da URL de retorno servem só de pista — quem decide é a API.
   */
  syncPayment: base
    .input(orderAccess.extend({ paymentId: z.string().regex(/^\d{1,20}$/).optional() }))
    .handler(async ({ input }) => {
      let order = await loadOrderWithAccess(input.reference, input.token);
      const settled = order.paidAt != null && order.paymentStatus === "approved";
      const recent =
        order.paymentCheckedAt != null &&
        Date.now() - order.paymentCheckedAt.getTime() < SYNC_MIN_INTERVAL_MS;
      let syncError: string | null = null;
      if (!settled && !recent && paymentsConfigured() && orderEnvironmentMatches(order)) {
        try {
          await reconcileOrder(order, input.paymentId);
        } catch (err) {
          console.error(
            `[orders] conciliação de ${order.reference} falhou:`,
            err instanceof MercadoPagoError ? err.message : (err as Error).message
          );
          syncError = "Não conseguimos consultar o Mercado Pago agora. Tente atualizar em instantes.";
        }
        order = await loadOrderWithAccess(input.reference, input.token);
      }
      return { ...(await publicOrder(order)), syncError };
    }),
};
