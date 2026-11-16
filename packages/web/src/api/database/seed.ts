/**
 * Popula o banco com o catálogo real da Kalango e as receitas em vídeo.
 * Uso: cd packages/web && bun --env-file=../../.env src/api/database/seed.ts
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { seedMerch } from "./merch-data";
import { seedProducts } from "./seed-data";

const recipes = [
  {
    title: "Coado no V60 com microlote fermentado",
    method: "V60",
    instagramUrl:
      "https://www.instagram.com/reel/DaLH9AiJ4cn/",
    shortcode: "DaLH9AiJ4cn",
    description:
      "15 g de café moído médio, 250 ml de água a 92 °C, extração em 2:30. O passo a passo direto da torrefação.",
    position: 0,
    published: true,
  },
];

async function main() {
  for (const p of seedProducts) {
    await db.insert(schema.products).values({
      slug: p.slug,
      name: p.name,
      sku: p.sku,
      priceCents: p.priceCents,
      weightGrams: 250,
      shortDescription: p.shortDescription,
      description: p.description,
      story: p.story,
      variety: p.variety,
      altitude: p.altitude,
      process: p.process,
      aroma: p.aroma,
      flavor: p.flavor,
      acidity: p.acidity,
      bodyNote: p.bodyNote,
      finish: p.finish,
      producer: p.producer,
      origin: p.origin,
      roast: p.roast,
      scaScore: p.scaScore,
      notes: [p.family, ...p.notes],
      images: p.images,
      featured: p.featured,
      position: p.position,
    }).onConflictDoNothing();
  }

  for (const m of seedMerch) {
    await db.insert(schema.merch).values(m).onConflictDoNothing();
  }

  for (const recipe of recipes) {
    const [existing] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(eq(schema.recipes.shortcode, recipe.shortcode))
      .limit(1);
    if (!existing) await db.insert(schema.recipes).values(recipe);
  }

  console.log(
    `seed ok: ${seedProducts.length} produtos, ${seedMerch.length} itens lifestyle, ${recipes.length} receitas (registros existentes preservados)`
  );
}

main();
