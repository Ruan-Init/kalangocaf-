/**
 * Gera as versões estáticas dos feeds de SEO em packages/web/public/, para que
 * /sitemap.xml, /robots.txt e /llms.txt respondam nos caminhos raiz que os
 * crawlers esperam (o servidor HTTP do template só encaminha /api para o Hono).
 *
 * Rodar após mudar catálogo, posts ou SITE_URL:
 *   cd packages/web && bun --env-file=../../.env run src/api/seo/build-feeds.ts
 */
import { mkdir } from "node:fs/promises";
import { googleMerchantXml, llmsTxt, robotsTxt, sitemapXml } from "./feeds";

const outDir = `${import.meta.dirname}/../../../public`;

await mkdir(outDir, { recursive: true });

const files: Array<[string, string]> = [
  ["sitemap.xml", await sitemapXml()],
  ["robots.txt", robotsTxt()],
  ["llms.txt", await llmsTxt()],
  ["feeds/google-merchant.xml", await googleMerchantXml()],
];

for (const [name, body] of files) {
  await Bun.write(`${outDir}/${name}`, body);
  console.log(`escrito public/${name} (${body.length} bytes)`);
}
