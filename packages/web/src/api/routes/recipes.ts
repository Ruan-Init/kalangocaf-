/**
 * "Conheça o seu café" — receitas em vídeo (reels do Instagram) e os textos
 * editáveis da página.
 *
 * Leitura é pública; escrita usa a mesma senha de operação do painel (OPS_TOKEN),
 * validada por assertOps.
 */
import { ORPCError } from "@orpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { assertOps } from "./admin";

/** Chaves de texto que a página usa, com o valor padrão de fábrica. */
export const RECIPE_TEXT_DEFAULTS = {
  "conheca.kicker": "Conheça o seu café",
  "conheca.titulo": "Conheça o seu café",
  "conheca.intro":
    "Receitas em vídeo direto da torrefação: o método, a proporção e o tempo que a gente usa pra extrair o melhor de cada microlote.",
  "conheca.cta": "Ficou com dúvida no preparo? Chama a gente no WhatsApp.",
} as const;

export type RecipeTextKey = keyof typeof RECIPE_TEXT_DEFAULTS;

const TEXT_KEYS = Object.keys(RECIPE_TEXT_DEFAULTS) as RecipeTextKey[];

/** Extrai o código do post de qualquer formato de link do Instagram. */
export function instagramShortcode(url: string) {
  const match = url.match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}

const withToken = z.object({ token: z.string().min(1) });

const recipeInput = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(2, "Dê um título pra receita.").max(120),
  method: z.string().trim().min(1).max(60).default("Receita"),
  instagramUrl: z.string().trim().url("Cole o link completo do reel."),
  description: z.string().trim().max(2000).optional(),
  position: z.number().int().min(0).max(999).default(0),
  published: z.boolean().default(true),
});

async function readTexts() {
  const rows = await db.select().from(schema.siteTexts);
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    TEXT_KEYS.map((key) => [key, saved[key] ?? RECIPE_TEXT_DEFAULTS[key]])
  ) as Record<RecipeTextKey, string>;
}

export const recipes = {
  /** Receitas publicadas, na ordem definida no painel. */
  list: base.handler(() =>
    db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.published, true))
      .orderBy(asc(schema.recipes.position), desc(schema.recipes.createdAt))
  ),

  /** Textos da página, já com fallback nos padrões. */
  texts: base.handler(() => readTexts()),

  /* ----------------------------- painel ----------------------------- */

  /** Tudo, inclusive rascunhos não publicados. */
  adminList: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    const [rows, texts] = await Promise.all([
      db
        .select()
        .from(schema.recipes)
        .orderBy(asc(schema.recipes.position), desc(schema.recipes.createdAt)),
      readTexts(),
    ]);
    return { recipes: rows, texts };
  }),

  /** Cria (sem id) ou atualiza (com id) uma receita. */
  save: base.input(withToken.extend({ recipe: recipeInput })).handler(async ({ input }) => {
    assertOps(input.token);
    const { recipe } = input;
    const shortcode = instagramShortcode(recipe.instagramUrl);
    if (!shortcode) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Esse link não parece ser de um reel/post do Instagram. Exemplo: https://www.instagram.com/reel/ABC123/",
      });
    }

    const values = {
      title: recipe.title,
      method: recipe.method,
      instagramUrl: recipe.instagramUrl,
      shortcode,
      description: recipe.description?.length ? recipe.description : null,
      position: recipe.position,
      published: recipe.published,
      updatedAt: new Date(),
    };

    if (recipe.id) {
      const [row] = await db
        .update(schema.recipes)
        .set(values)
        .where(eq(schema.recipes.id, recipe.id))
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Receita não encontrada." });
      return row;
    }

    const [row] = await db.insert(schema.recipes).values(values).returning();
    return row;
  }),

  remove: base
    .input(withToken.extend({ id: z.number().int().positive() }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      await db.delete(schema.recipes).where(eq(schema.recipes.id, input.id));
      return { ok: true };
    }),

  /** Salva os textos da página. Valor vazio volta pro padrão de fábrica. */
  setTexts: base
    .input(
      withToken.extend({
        texts: z.record(z.enum(TEXT_KEYS as [RecipeTextKey, ...RecipeTextKey[]]), z.string().max(2000)),
      })
    )
    .handler(async ({ input }) => {
      assertOps(input.token);
      for (const [key, raw] of Object.entries(input.texts)) {
        const value = raw.trim();
        if (!value) {
          await db.delete(schema.siteTexts).where(eq(schema.siteTexts.key, key));
          continue;
        }
        await db
          .insert(schema.siteTexts)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.siteTexts.key,
            set: { value, updatedAt: new Date() },
          });
      }
      return readTexts();
    }),
};
