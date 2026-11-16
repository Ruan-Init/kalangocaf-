import { and, desc, eq } from "drizzle-orm";
import { STORE } from "../config/store";
import { db } from "../database";
import * as schema from "../database/schema";

import { publishedCoffee } from "../services/bling-publish";

export const SITE_URL = (process.env.SITE_URL ?? "https://kalangocafe.com.br").replace(/\/$/, "");

const STATIC_PATHS = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/loja", priority: "0.9", changefreq: "daily" },
  { path: "/loja?aba=lifestyle", priority: "0.6", changefreq: "weekly" },
  { path: "/clube", priority: "0.8", changefreq: "monthly" },
  { path: "/sobre", priority: "0.6", changefreq: "yearly" },
  { path: "/conheca-seu-cafe", priority: "0.6", changefreq: "weekly" },
  { path: "/contato", priority: "0.5", changefreq: "yearly" },
];

/** Fotos locais viram URL absoluta; as do Bling (café novo) já vêm absolutas. */
function absUrl(path: string) {
  return /^https?:\/\//.test(path) ? path : `${SITE_URL}${path}`;
}

function xmlEscape(v: string) {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function catalogRows() {
  return db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.active, true), publishedCoffee()))
    .orderBy(schema.products.position);
}

async function recipeRows() {
  return db
    .select()
    .from(schema.recipes)
    .where(eq(schema.recipes.published, true))
    .orderBy(desc(schema.recipes.createdAt));
}

export async function sitemapXml() {
  const products = await catalogRows();
  const urls = [
    ...STATIC_PATHS.map((s) => ({ loc: `${SITE_URL}${s.path}`, lastmod: null as string | null, ...s })),
    ...products.map((p) => ({
      loc: `${SITE_URL}/cafe/${p.slug}`,
      lastmod: new Date(p.createdAt).toISOString(),
      priority: "0.8",
      changefreq: "weekly",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${
    urls
      .map((u) =>
        [
          "  <url>",
          `    <loc>${xmlEscape(u.loc)}</loc>`,
          u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
          `    <changefreq>${u.changefreq}</changefreq>`,
          `    <priority>${u.priority}</priority>`,
          "  </url>",
        ].filter(Boolean).join("\n")
      )
      .join("\n")
  }
</urlset>
`;
}

export function robotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /checkout
Disallow: /carrinho
Disallow: /pedido/

# Crawlers de IA — liberados de propósito
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Bingbot
Allow: /
User-agent: Applebot-Extended
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

/**
 * Feed de produtos para o Google Merchant Center (RSS 2.0 + namespace g:).
 * O Merchant ID só é necessário para cadastrar a URL deste feed no painel —
 * gerar o XML não exige credencial.
 * Especificação: https://support.google.com/merchants/answer/7052112
 */
export async function googleMerchantXml() {
  const products = await catalogRows();
  const price = (c: number) => `${(c / 100).toFixed(2)} BRL`;

  const items = products.map((p) => {
    const description = p.shortDescription ?? p.description ?? `${p.name} — café especial em grãos ou moído, pacote de 250g, torrado pela ${STORE.name}.`;
    const image = p.images[0] ? absUrl(p.images[0]) : null;
    const extra = p.images.slice(1, 11).map((img) => `      <g:additional_image_link>${xmlEscape(absUrl(img))}</g:additional_image_link>`);

    return [
      "    <item>",
      `      <g:id>${xmlEscape(p.sku ?? p.slug)}</g:id>`,
      `      <g:title>${xmlEscape(`${p.name} — Café Especial 250g`)}</g:title>`,
      `      <g:description>${xmlEscape(description)}</g:description>`,
      `      <g:link>${xmlEscape(`${SITE_URL}/cafe/${p.slug}`)}</g:link>`,
      image ? `      <g:image_link>${xmlEscape(image)}</g:image_link>` : null,
      ...extra,
      `      <g:availability>${p.stock > 0 ? "in_stock" : "out_of_stock"}</g:availability>`,
      `      <g:price>${price(p.priceCents)}</g:price>`,
      p.compareAtCents && p.compareAtCents > p.priceCents
        ? `      <g:sale_price>${price(p.priceCents)}</g:sale_price>`
        : null,
      "      <g:condition>new</g:condition>",
      `      <g:brand>${xmlEscape(STORE.name)}</g:brand>`,
      p.sku
        ? `      <g:mpn>${xmlEscape(p.sku)}</g:mpn>`
        : "      <g:identifier_exists>no</g:identifier_exists>",
      // 2073 = Food, Beverages & Tobacco > Beverages > Coffee
      "      <g:google_product_category>2073</g:google_product_category>",
      "      <g:product_type>Cafés Especiais &gt; Grãos e Moído &gt; 250g</g:product_type>",
      `      <g:shipping_weight>${STORE.package250g.weightKg.toFixed(3)} kg</g:shipping_weight>`,
      "      <g:item_group_id>cafe-250g</g:item_group_id>",
      "    </item>",
    ].filter(Boolean).join("\n");
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(STORE.name)}</title>
    <link>${xmlEscape(SITE_URL)}</link>
    <description>Microlotes de cafés especiais torrados em Brasília-DF.</description>
${items.join("\n")}
  </channel>
</rss>
`;
}

/** Resumo em texto para buscadores de IA (llms.txt). */
export async function llmsTxt() {
  const [products, recipes] = await Promise.all([catalogRows(), recipeRows()]);
  const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;

  return `# Kalango Cafés Especiais

> Torrefação de cafés especiais em Brasília-DF. Microlotes rastreados de produtores do Cerrado
> Mineiro, Sul de Minas e Campo das Vertentes, com fermentação controlada e curva de torra própria
> para cada lote. Venda de café em grãos ou moído (250g), clube de assinatura mensal e atacado
> para cafeterias.

## Informações da empresa

- Nome: ${STORE.name}
- Endereço da torrefação: ${STORE.address.street} ${STORE.address.unit}, ${STORE.address.district}, ${STORE.address.city}-${STORE.address.state}, CEP ${STORE.originPostalCodeLabel}, Brasil
- WhatsApp/telefone: ${STORE.phoneLabel}
- E-mail: ${STORE.email}
- Site: ${SITE_URL}
- Instagram: ${STORE.instagram} (@kalango_cafe)
- Entrega: todo o Brasil (PAC e SEDEX), retirada na torrefação em Brasília
- Frete grátis: pedidos acima de ${brl(STORE.freeShippingFromCents)}
- Pagamento: Pix, cartão de crédito parcelado e cartão de débito
- Moagens disponíveis: grãos, espresso, coado, prensa francesa, italiana

## Catálogo (${products.length} cafés, pacotes de 250g)

${
    products
      .map((p) =>
        [
          `- [${p.name}](${SITE_URL}/cafe/${p.slug}) — ${brl(p.priceCents)}`,
          p.scaScore ? ` | SCA ${p.scaScore}` : "",
          p.variety ? ` | variedade ${p.variety}` : "",
          p.process ? ` | processo ${p.process}` : "",
          p.altitude ? ` | altitude ${p.altitude}` : "",
          p.origin ? ` | origem ${p.origin}` : "",
          p.producer ? ` | produtor ${p.producer}` : "",
          p.notes.length ? ` | notas ${p.notes.join(", ")}` : "",
        ].join("")
      )
      .join("\n")
  }

## Clube de assinatura

- Descoberta — R$ 79,00/mês: 1 microlote de 250g por mês, frete incluso.
- Duo — R$ 149,00/mês: 2 microlotes contrastantes, 10% off em compras avulsas, frete incluso.
- Obsessão — R$ 259,00/mês: 3 microlotes, acesso a lotes exclusivos, 15% off, frete incluso.
- Sem fidelidade: pausa, troca ou cancelamento a qualquer momento.

## Conheça o seu café (receitas em vídeo)

${
    recipes.length
      ? recipes
        .map((r) => `- ${r.title} (${r.method}) — vídeo: ${r.instagramUrl}${r.description ? ` — ${r.description.replace(/\s+/g, " ")}` : ""}`)
        .join("\n")
      : "- Receitas em vídeo publicadas em " + `${SITE_URL}/conheca-seu-cafe`
  }

## Páginas

- [Loja](${SITE_URL}/loja): catálogo completo com filtro por família sensorial.
- [Lifestyle](${SITE_URL}/loja?aba=lifestyle): boné, caneca, camiseta e chaveiro da marca, em pré-lançamento com lista de espera.
- [Clube & Atacado](${SITE_URL}/clube): assinatura mensal e condições para cafeterias.
- [Sobre](${SITE_URL}/sobre): história da torrefação e método de torra.
- [Contato](${SITE_URL}/contato): WhatsApp, e-mail e endereço.
`;
}
