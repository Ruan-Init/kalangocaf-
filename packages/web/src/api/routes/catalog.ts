import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { retryPendingOrders } from "../services/bling-orders";
import { maybeAutoSync } from "../services/bling-sync";

import { publishedCoffee, publishedMerch } from "../services/bling-publish";

export const catalog = {
  list: base.handler(() => {
    // Mantém preço/estoque em dia com o Bling (a cada 6 h, sem segurar a resposta).
    maybeAutoSync(retryPendingOrders);
    return db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.active, true), publishedCoffee()))
      .orderBy(asc(schema.products.position));
  }),

  get: base.input(z.object({ slug: z.string() })).handler(async ({ input }) => {
    const [product] = await db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.slug, input.slug), publishedCoffee()))
      .limit(1);
    if (!product) throw new ORPCError("NOT_FOUND", { message: "Café não encontrado" });
    return product;
  }),

  /** Linha lifestyle — vitrine de pré-lançamento, separada dos cafés. */
  merch: base.handler(() =>
    db
      .select()
      .from(schema.merch)
      .where(and(eq(schema.merch.published, true), eq(schema.merch.active, true), publishedMerch()))
      .orderBy(asc(schema.merch.position))
  ),

  related: base
    .input(z.object({ slug: z.string(), limit: z.number().min(1).max(8).default(3) }))
    .handler(async ({ input }) => {
      const all = await db
        .select()
        .from(schema.products)
        .where(and(eq(schema.products.active, true), publishedCoffee()))
        .orderBy(asc(schema.products.position));
      return all.filter((p) => p.slug !== input.slug).slice(0, input.limit);
    }),
};
