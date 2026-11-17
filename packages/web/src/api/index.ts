import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { admin, assertOps } from "./routes/admin";
import { handlePhotoUpload } from "./routes/photo-upload";
import { handlePhotoRead } from "./routes/photo-read";
import { bling } from "./routes/bling";
import { catalog } from "./routes/catalog";
import { club } from "./routes/club";
import { leads } from "./routes/leads";
import { newsletter } from "./routes/newsletter";
import { orders } from "./routes/orders";
import { ping } from "./routes/ping";
import { recipes } from "./routes/recipes";
import { googleMerchantXml, llmsTxt, robotsTxt, sitemapXml } from "./seo/feeds";
import { blingCallback, blingWebhook } from "./services/bling-webhook";
import { mercadoPagoWebhook } from "./services/mercadopago-webhook";
import { newsletterOneClick } from "./services/newsletter-unsubscribe";
import { missingPhotoStorageConfig } from "./lib/s3";
import { readPhoto, storePhoto } from "./services/photo-storage";

export const router = {
  ping,
  catalog,
  club,
  recipes,
  orders,
  leads,
  newsletter,
  admin,
  bling,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);

app.post("/api/admin/upload-photo", (c) =>
  handlePhotoUpload(c.req.raw, {
    assertOps,
    missingConfig: missingPhotoStorageConfig,
    storePhoto,
  })
);

app.get("/api/photos/:folder/:filename", (c) =>
  handlePhotoRead(`${c.req.param("folder")}/${c.req.param("filename")}`, {
    missingConfig: missingPhotoStorageConfig,
    readPhoto,
  })
);

// Feeds de SEO / busca por IA. Servidos sob /api porque o dev plugin e o
// __server.ts só encaminham /api para o Hono. As versões em public/ (geradas por
// `bun run seo:feeds`) cobrem os caminhos raiz que os crawlers esperam.
app.get("/api/sitemap.xml", async (c) =>
  c.text(await sitemapXml(), 200, { "content-type": "application/xml; charset=utf-8" }));
app.get("/api/robots.txt", (c) =>
  c.text(robotsTxt(), 200, { "content-type": "text/plain; charset=utf-8" }));
app.get("/api/llms.txt", async (c) =>
  c.text(await llmsTxt(), 200, { "content-type": "text/plain; charset=utf-8" }));

// Feed de produtos do Google Merchant Center — cadastrar esta URL no painel.
app.get("/api/feeds/google-merchant.xml", async (c) =>
  c.text(await googleMerchantXml(), 200, { "content-type": "application/xml; charset=utf-8" }));

// Webhook do Mercado Pago (Pagamentos). Lógica em services/mercadopago-webhook.ts.
app.post("/api/webhooks/mercadopago", (c) => mercadoPagoWebhook(c));
app.post("/api/webhooks/newsletter/unsubscribe", (c) => newsletterOneClick(c));

// Bling: volta da autorização OAuth (URL cadastrada no app do Bling) e webhooks
// de produto/estoque. Lógica em services/bling-webhook.ts.
app.get("/api/bling/callback", (c) => blingCallback(c));
app.post("/api/webhooks/bling", (c) => blingWebhook(c));

export default app;
