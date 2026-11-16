/**
 * Painel de gestão da torrefação.
 *
 * Não existe área logada no site (decisão do cliente), então o acesso é por
 * token compartilhado: OPS_TOKEN no .env. Todo procedimento aqui recebe o token
 * no input e valida antes de tocar no banco. Sem OPS_TOKEN configurado, o
 * painel fica fechado para todo mundo — inclusive pra quem chutar o token.
 */
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { emailReady, sendShippingNotice } from "../services/email";
import { retryOrderEmails } from "../services/order-email";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { publicUrl, s3 } from "../lib/s3";
import { assertPublicationEditable, creationSku, publicationOpen, publicationRow, publishToBling } from "../services/bling-publish";

export const ORDER_STATUS = [
  "pending_payment",
  "paid",
  "roasting",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const withToken = z.object({ token: z.string().min(1) });

export function assertOps(token: string) {
  const expected = process.env.OPS_TOKEN;
  if (!expected) {
    throw new ORPCError("FORBIDDEN", {
      message: "Painel desativado: OPS_TOKEN não está configurado no servidor.",
    });
  }
  if (token !== expected) {
    throw new ORPCError("UNAUTHORIZED", { message: "Senha inválida." });
  }
}

/**
 * Pedido de teste nunca entra na operação: só pode ser cancelado. E pagamento
 * do Mercado Pago só é marcado pelo webhook/conciliação, nunca à mão.
 */
function assertNotTestFulfillment(order: schema.Order, next: string) {
  if (order.isTest && next !== "cancelled") {
    throw new ORPCError("FORBIDDEN", {
      message: "Pedido de teste: não entra na torra/envio. Só pode ser cancelado.",
    });
  }
  if (next === "paid" && order.mpPreferenceId && !order.paidAt) {
    throw new ORPCError("FORBIDDEN", {
      message: "Pagamento do Mercado Pago é confirmado automaticamente pela API, não à mão.",
    });
  }
}

export const admin = {
  /** Valida a senha sem devolver dado nenhum — usado na tela de entrada. */
  check: base.input(withToken).handler(({ input }) => {
    assertOps(input.token);
    return { ok: true, emailReady };
  }),

  /** Contadores do topo do painel. */
  summary: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    // Pedidos de teste (Mercado Pago em modo teste) não entram em faturamento nem fila.
    const all = await db.select().from(schema.orders);
    const rows = all.filter((o) => !o.isTest);
    const faturado = rows
      .filter((o) => !["pending_payment", "cancelled"].includes(o.status))
      .reduce((s, o) => s + o.totalCents, 0);
    const porStatus = ORDER_STATUS.map((status) => ({
      status,
      count: rows.filter((o) => o.status === status).length,
    }));
    const leadRows = await db.select().from(schema.leads);
    return {
      total: rows.length,
      aFazer: rows.filter((o) => ["paid", "roasting"].includes(o.status)).length,
      faturadoCents: faturado,
      porStatus,
      leads: leadRows.length,
      testes: all.length - rows.length,
    };
  }),

  /** Pedidos mais recentes primeiro, já com os itens de cada um. */
  orders: base
    .input(withToken.extend({ status: z.enum(ORDER_STATUS).optional() }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      const rows = input.status
        ? await db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.status, input.status))
          .orderBy(desc(schema.orders.createdAt))
          .limit(200)
        : await db
          .select()
          .from(schema.orders)
          .orderBy(desc(schema.orders.createdAt))
          .limit(200);

      if (rows.length === 0) return [];

      const items = await db
        .select()
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.orderId, rows.map((r) => r.id)));
      const mailRows = await db.select({ orderId: schema.orderEmails.orderId, audience: schema.orderEmails.audience, status: schema.orderEmails.status, error: schema.orderEmails.error, acceptedAt: schema.orderEmails.acceptedAt })
        .from(schema.orderEmails).where(inArray(schema.orderEmails.orderId, rows.map((r) => r.id)));

      // Hashes de acesso/idempotência nunca saem do servidor.
      return rows.map(({ accessTokenHash: _a, idempotencyHash: _i, requestFingerprint: _f, ...o }) => ({
        ...o,
        isTest: Boolean(o.isTest),
        items: items.filter((i) => i.orderId === o.id),
        confirmationEmails: mailRows.filter((e) => e.orderId === o.id),
      }));
    }),

  retryConfirmation: base.input(withToken.extend({ reference: z.string().min(1) })).handler(async ({ input }) => {
    assertOps(input.token);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.reference, input.reference)).limit(1);
    if (!order) throw new ORPCError("NOT_FOUND", { message: "Pedido não encontrado." });
    return { emails: await retryOrderEmails(order) };
  }),

  /** Move o pedido de etapa (torra, entregue, cancelado…). */
  setStatus: base
    .input(withToken.extend({ reference: z.string().min(1), status: z.enum(ORDER_STATUS) }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.reference, input.reference))
        .limit(1);
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Pedido não encontrado" });
      assertNotTestFulfillment(order, input.status);

      await db
        .update(schema.orders)
        .set({ status: input.status })
        .where(eq(schema.orders.id, order.id));

      return { reference: order.reference, status: input.status };
    }),

  /**
   * Grava o código de rastreio, marca como enviado e avisa o cliente por e-mail.
   * Se o e-mail não estiver configurado, o status muda de qualquer jeito e o
   * retorno diz que o aviso não saiu — quem está no painel precisa saber disso.
   */
  ship: base
    .input(
      withToken.extend({
        reference: z.string().min(1),
        trackingCode: z.string().min(4),
        trackingUrl: z.string().optional(),
      })
    )
    .handler(async ({ input }) => {
      assertOps(input.token);
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.reference, input.reference))
        .limit(1);
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Pedido não encontrado" });
      assertNotTestFulfillment(order, "shipped");

      await db
        .update(schema.orders)
        .set({ status: "shipped", shippingTrackingCode: input.trackingCode })
        .where(eq(schema.orders.id, order.id));

      const mail = await sendShippingNotice({
        reference: order.reference,
        customerName: order.customerName,
        email: order.email,
        trackingCode: input.trackingCode,
        shippingLabel: order.shippingMethod,
        trackingUrl: input.trackingUrl,
      });

      return { reference: order.reference, status: "shipped", emailSent: mail.sent };
    }),

  /** Contatos, atacado, clube e newsletter — hoje é aqui que o clube aparece. */
  leads: base
    .input(withToken.extend({ kind: z.string().optional() }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      const rows = await db
        .select()
        .from(schema.leads)
        .orderBy(desc(schema.leads.createdAt))
        .limit(200);
      return input.kind ? rows.filter((l) => l.kind === input.kind) : rows;
    }),

  /* ------------------------- linha lifestyle ------------------------- */

  /** Toda a linha lifestyle, inclusive rascunhos. */
  merchList: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    return db.select().from(schema.merch).orderBy(asc(schema.merch.position), asc(schema.merch.id));
  }),

  /** Cria (sem id) ou atualiza (com id) um item da linha lifestyle. */
  merchSave: base
    .input(
      withToken.extend({
        item: z.object({
          id: z.number().int().positive().optional(),
          creationKey: z.string().uuid().optional(),
          slug: z
            .string()
            .trim()
            .min(2, "Informe um slug (ex.: boné-kalango).")
            .max(80)
            .regex(/^[a-z0-9-]+$/, "Slug só pode ter letras minúsculas, números e hífen."),
          name: z.string().trim().min(2, "Dê um nome pro produto.").max(120),
          category: z.enum(["bone", "caneca", "camiseta", "chaveiro"]),
          tagline: z.string().trim().max(160).optional(),
          description: z.string().trim().max(2000).optional(),
          tone: z.enum(["jungle", "ocean", "lime", "gold", "red", "sky"]).default("jungle"),
          priceCents: z.number().int().positive("Informe um preço maior que zero."),
          sizes: z.array(z.string().trim().min(1).max(12)).max(20).default([]),
          images: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
          released: z.boolean().default(false),
          published: z.boolean().default(true),
          position: z.number().int().min(0).max(999).default(0),
        }),
      })
    )
    .handler(async ({ input }) => {
      assertOps(input.token);
      const { item } = input;
      if (!item.id) {
        if (!item.creationKey) throw new ORPCError("BAD_REQUEST", { message: "Reabra o formulário para iniciar um novo cadastro." });
        const [duplicate] = await db.select().from(schema.merch).where(eq(schema.merch.creationKey, item.creationKey)).limit(1);
        if (duplicate) return publishToBling("merch", duplicate.id);
      }
      const existing = item.id ? await publicationRow("merch", item.id) : null;
      if (existing) assertPublicationEditable(existing);

      // Slug é a chave da URL: não pode repetir em outro item.
      const [clash] = await db
        .select({ id: schema.merch.id })
        .from(schema.merch)
        .where(eq(schema.merch.slug, item.slug))
        .limit(1);
      if (clash && clash.id !== item.id) {
        throw new ORPCError("BAD_REQUEST", { message: "Já existe um produto com esse slug." });
      }

      const values = {
        slug: item.slug,
        name: item.name,
        category: item.category,
        tagline: item.tagline?.length ? item.tagline : null,
        description: item.description?.length ? item.description : null,
        tone: item.tone,
        priceCents: item.priceCents,
        sizes: item.sizes.filter(Boolean),
        images: item.images.filter(Boolean),
        released: item.released,
        published: item.published,
        position: item.position,
      };

      if (item.id) {
        const [row] = await db
          .update(schema.merch)
          .set({ ...values, ...(existing?.blingId || existing?.productAttempted ? {
            name: existing.name, slug: existing.slug, priceCents: existing.priceCents,
            description: existing.description,
          } : {}) })
          .where(and(eq(schema.merch.id, item.id), eq(schema.merch.publicationStatus, existing!.publicationStatus),
            eq(schema.merch.productAttempted, existing!.productAttempted)))
          .returning();
        if (!row) throw new ORPCError("CONFLICT", { message: "Cadastro mudou durante o envio. Atualize a lista e tente novamente." });
        return publicationOpen(row) ? publishToBling("merch", row.id) : row;
      }

      const [row] = await db.insert(schema.merch).values({
        ...values, creationKey: item.creationKey!, sku: creationSku("merch", item.creationKey!),
        publicationStatus: "pending",
      }).onConflictDoNothing({ target: schema.merch.creationKey }).returning();
      const saved = row ?? (await db.select().from(schema.merch).where(eq(schema.merch.creationKey, item.creationKey!)))[0];
      return publishToBling("merch", saved.id);
    }),

  /* ------------------------------ cafés ------------------------------ */

  /**
   * Todos os cafés, inclusive inativos no Bling. Nome, preço, estoque,
   * descrição e situação vêm do Bling e não são editados aqui.
   */
  coffeeList: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    return db.select().from(schema.products).orderBy(asc(schema.products.position), asc(schema.products.id));
  }),

  /** Novo café é um rascunho até o Bling confirmar; vinculados preservam dados do ERP. */
  coffeeSave: base
    .input(
      withToken.extend({
        item: z.object({
          id: z.number().int().positive().optional(),
          creationKey: z.string().uuid().optional(),
          name: z.string().trim().min(2).max(120).optional(),
          slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
          description: z.string().trim().max(4000).nullable().optional(),
          priceCents: z.number().int().min(0).optional(),
          stock: z.number().int().min(0).optional(),
          weightGrams: z.number().int().min(1).max(30000).optional(),
          active: z.boolean().optional(),
          shortDescription: z.string().trim().max(400).nullable(),
          story: z.string().trim().max(4000).nullable(),
          variety: z.string().trim().max(120).nullable(),
          altitude: z.string().trim().max(60).nullable(),
          process: z.string().trim().max(160).nullable(),
          producer: z.string().trim().max(160).nullable(),
          origin: z.string().trim().max(160).nullable(),
          roast: z.string().trim().max(60).nullable(),
          aroma: z.string().trim().max(240).nullable(),
          flavor: z.string().trim().max(240).nullable(),
          acidity: z.string().trim().max(60).nullable(),
          bodyNote: z.string().trim().max(60).nullable(),
          finish: z.string().trim().max(160).nullable(),
          scaScore: z.number().min(0).max(100).nullable(),
          notes: z.array(z.string().trim().min(1).max(40)).max(12),
          images: z.array(z.string().trim().min(1).max(300)).max(10),
          featured: z.boolean(),
          position: z.number().int().min(0).max(999),
        }),
      })
    )
    .handler(async ({ input }) => {
      assertOps(input.token);
      const { id, creationKey, ...rest } = input.item;
      if (!id) {
        if (!creationKey) throw new ORPCError("BAD_REQUEST", { message: "Reabra o formulário para iniciar um novo cadastro." });
        const [duplicate] = await db.select().from(schema.products).where(eq(schema.products.creationKey, creationKey)).limit(1);
        if (duplicate) return publishToBling("coffee", duplicate.id);
      }
      const vazio = (v: string | null) => (v && v.length ? v : null);
      const [existing] = id
        ? await db.select().from(schema.products).where(eq(schema.products.id, id)).limit(1)
        : [];
      if (id && !existing) throw new ORPCError("NOT_FOUND", { message: "Café não encontrado." });

      // O vínculo é conferido no servidor, nunca confiado ao formulário.
      if (existing) assertPublicationEditable(existing);
      const local = !existing?.blingId && !existing?.productAttempted;
      if (local && (!rest.name || !rest.slug || rest.priceCents == null || rest.stock == null)) {
        throw new ORPCError("BAD_REQUEST", { message: "Preencha nome, endereço, preço e estoque do café." });
      }
      if (!id && !(rest.priceCents! > 0)) throw new ORPCError("BAD_REQUEST", { message: "Informe um preço maior que zero." });
      if (local && rest.slug) {
        const [clash] = await db.select({ id: schema.products.id }).from(schema.products)
          .where(eq(schema.products.slug, rest.slug)).limit(1);
        if (clash && clash.id !== id) {
          throw new ORPCError("BAD_REQUEST", { message: "Já existe um café com esse endereço." });
        }
      }
      const values = {
          shortDescription: vazio(rest.shortDescription),
          story: vazio(rest.story),
          variety: vazio(rest.variety),
          altitude: vazio(rest.altitude),
          process: vazio(rest.process),
          producer: vazio(rest.producer),
          origin: vazio(rest.origin),
          roast: vazio(rest.roast),
          aroma: vazio(rest.aroma),
          flavor: vazio(rest.flavor),
          acidity: vazio(rest.acidity),
          bodyNote: vazio(rest.bodyNote),
          finish: vazio(rest.finish),
          scaScore: rest.scaScore,
          notes: rest.notes.filter(Boolean),
          images: rest.images.filter(Boolean),
          featured: rest.featured,
          position: rest.position,
          ...(local ? {
            name: rest.name!,
            slug: rest.slug!,
            description: vazio(rest.description ?? null),
            priceCents: rest.priceCents!,
            stock: rest.stock!,
            weightGrams: rest.weightGrams ?? existing?.weightGrams ?? 250,
            active: rest.active ?? existing?.active ?? true,
            ...(existing && publicationOpen(existing) ? { initialStock: rest.stock! } : {}),
          } : {}),
      };
      const [row] = id
        ? await db.update(schema.products).set(values).where(and(eq(schema.products.id, id),
            eq(schema.products.publicationStatus, existing!.publicationStatus),
            eq(schema.products.productAttempted, existing!.productAttempted))).returning()
        : await db.insert(schema.products).values({
            ...values,
            name: rest.name!,
            slug: rest.slug!,
            priceCents: rest.priceCents!,
            stock: rest.stock!,
            sku: creationSku("coffee", creationKey!), creationKey: creationKey!,
            publicationStatus: "pending", initialStock: rest.stock!,
          }).onConflictDoNothing({ target: schema.products.creationKey }).returning();
      if (id && !row) throw new ORPCError("CONFLICT", { message: "Cadastro mudou durante o envio. Atualize a lista e tente novamente." });
      const saved = row ?? (await db.select().from(schema.products).where(eq(schema.products.creationKey, creationKey!)))[0];
      return publicationOpen(saved) ? publishToBling("coffee", saved.id) : saved;
    }),

  retryPublication: base.input(withToken.extend({ kind: z.enum(["coffee", "merch"]), id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      return publishToBling(input.kind, input.id);
    }),

  /** Exclui apenas o anúncio no site; nunca apaga produtos no Bling. */
  coffeeRemove: base
    .input(withToken.extend({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      const [product] = await db.select().from(schema.products)
        .where(eq(schema.products.id, input.id)).limit(1);
      if (!product) throw new ORPCError("NOT_FOUND", { message: "Café não encontrado." });
      assertPublicationEditable(product);
      if (publicationOpen(product) && product.productAttempted) throw new ORPCError("CONFLICT", { message: "Confirme o vínculo/estoque antes de excluir; o cadastro pode já existir no Bling." });
      const [orderItem] = await db.select({ id: schema.orderItems.id }).from(schema.orderItems)
        .where(eq(schema.orderItems.productId, input.id)).limit(1);
      if (orderItem) {
        throw new ORPCError("CONFLICT", {
          message: "Este café tem histórico de pedidos e não pode ser excluído. Desative-o pela gestão ou pelo Bling para retirá-lo da loja.",
        });
      }
      const removed = await db.delete(schema.products).where(and(eq(schema.products.id, input.id),
        eq(schema.products.publicationStatus, product.publicationStatus),
        eq(schema.products.productAttempted, product.productAttempted))).returning({ id: schema.products.id });
      if (!removed.length) throw new ORPCError("NOT_FOUND", { message: "Café não encontrado." });
      return { ok: true };
    }),

  merchRemove: base
    .input(withToken.extend({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      const product = await publicationRow("merch", input.id);
      assertPublicationEditable(product);
      if (publicationOpen(product) && product.productAttempted) throw new ORPCError("CONFLICT", { message: "Confirme o vínculo antes de excluir; o cadastro pode já existir no Bling." });
      const removed = await db.delete(schema.merch).where(and(eq(schema.merch.id, input.id),
        eq(schema.merch.publicationStatus, product.publicationStatus),
        eq(schema.merch.productAttempted, product.productAttempted))).returning({ id: schema.merch.id });
      if (!removed.length) throw new ORPCError("NOT_FOUND", { message: "Produto lifestyle não encontrado." });
      return { ok: true };
    }),

  /**
   * Link assinado para o navegador mandar uma foto direto pro storage (Tigris).
   * O arquivo fica público; a URL pública é o que vai em `images` do item.
   */
  uploadPresign: base
    .input(
      withToken.extend({
        filename: z.string().trim().min(1).max(200),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]),
        size: z.number().int().positive().max(15 * 1024 * 1024, "Foto maior que 15 MB."),
        folder: z.enum(["lifestyle", "cafes"]).default("lifestyle"),
      })
    )
    .handler(async ({ input }) => {
      assertOps(input.token);
      if (!process.env.S3_BUCKET) {
        throw new ORPCError("FORBIDDEN", { message: "Storage de fotos não configurado no servidor." });
      }
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }[input.contentType];
      const base = input.filename
        .replace(/\.[a-z0-9]+$/i, "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "foto";
      const key = `${input.folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          ContentType: input.contentType,
          ACL: "public-read",
        }),
        { expiresIn: 600, signableHeaders: new Set(["x-amz-acl"]) }
      );
      return { url, key, publicUrl: publicUrl(key) };
    }),
};
