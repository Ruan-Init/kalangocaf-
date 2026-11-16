import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Aditivo: itens antigos continuam visíveis; novos só após confirmação do ERP. */
const publicationFields = () => ({
  creationKey: text("creation_key").unique(),
  publicationStatus: text("publication_status").notNull().default("legacy"),
  publicationError: text("publication_error"),
  publicationAttemptAt: integer("publication_attempt_at", { mode: "timestamp" }),
  productAttempted: integer("product_attempted", { mode: "boolean" }).notNull().default(false),
  stockAttempted: integer("stock_attempted", { mode: "boolean" }).notNull().default(false),
  initialStock: integer("initial_stock").notNull().default(0),
  initialDepositId: integer("initial_deposit_id"),
});

/**
 * Schema da Kalango Cafés Especiais.
 * Aplique com `bun run db:push` (dentro de packages/web).
 */

export const products = sqliteTable("products", {
  ...publicationFields(),
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sku: text("sku"),
  priceCents: integer("price_cents").notNull(),
  compareAtCents: integer("compare_at_cents"),
  weightGrams: integer("weight_grams").notNull().default(250),
  shortDescription: text("short_description"),
  description: text("description"),
  story: text("story"),
  variety: text("variety"),
  altitude: text("altitude"),
  process: text("process"),
  aroma: text("aroma"),
  flavor: text("flavor"),
  acidity: text("acidity"),
  bodyNote: text("body_note"),
  finish: text("finish"),
  producer: text("producer"),
  origin: text("origin"),
  roast: text("roast"),
  scaScore: real("sca_score"),
  /** JSON string[] — notas sensoriais para filtro */
  notes: text("notes", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** JSON string[] — caminhos em /images/products */
  images: text("images", { mode: "json" }).$type<string[]>().notNull().default([]),
  stock: integer("stock").notNull().default(50),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),

  // --- Bling (fonte de preço, estoque, nome e descrição). Campos aditivos.
  /** false = inativo/excluído no Bling: some da loja, mas o link antigo continua abrindo. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** ID do produto no Bling, preenchido na primeira sincronização pelo SKU. */
  blingId: integer("bling_id").unique(),
  /** Nome como está no Bling (o site mostra sem "Café Kalango" e sem o peso). */
  blingName: text("bling_name"),
  blingSyncedAt: integer("bling_synced_at", { mode: "timestamp" }),
});

/**
 * Linha lifestyle (boné, caneca, camiseta, chaveiro). Fica fora de `products`
 * porque sua vitrine/carrinho são separados. Cadastros novos têm preço
 * obrigatório e vínculo Bling; registros antigos podem ainda ter preço nulo.
 * Não entra no checkout de cafés nem no feed do Google Merchant.
 */
export const merch = sqliteTable("merch", {
  ...publicationFields(),
  sku: text("sku"),
  blingId: integer("bling_id").unique(),
  blingSyncedAt: integer("bling_synced_at", { mode: "timestamp" }),
  stock: integer("stock").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** bone | caneca | camiseta | chaveiro */
  category: text("category").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  /** Cor da marca usada no card da vitrine: jungle | ocean | lime | gold | red | sky */
  tone: text("tone").notNull().default("jungle"),
  /** Obrigatório em novos cadastros; nulo permitido apenas para legado. */
  priceCents: integer("price_cents"),
  /** JSON string[] — ex.: ["P","M","G","GG"]. Vazio = tamanho único. */
  sizes: text("sizes", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** JSON string[] — fotos reais, quando existirem. Vazio usa a ilustração. */
  images: text("images", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** false = vitrine "em breve" com lista de espera. */
  released: integer("released", { mode: "boolean" }).notNull().default(false),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull().unique(),
  status: text("status").notNull().default("pending"),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  document: text("document").notNull(),
  zip: text("zip").notNull(),
  street: text("street").notNull(),
  number: text("number").notNull(),
  complement: text("complement"),
  district: text("district").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  shippingMethod: text("shipping_method").notNull(),
  /** id do serviço no Melhor Envio (ou "retirada") — necessário pra gerar a etiqueta */
  shippingServiceId: text("shipping_service_id"),
  shippingTrackingCode: text("shipping_tracking_code"),
  shippingCents: integer("shipping_cents").notNull().default(0),
  subtotalCents: integer("subtotal_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  paymentMethod: text("payment_method").notNull().default("mercadopago"),
  paymentIntentId: text("payment_intent_id"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),

  // --- Mercado Pago (Checkout Pro). Campos aditivos: pedidos antigos ficam com null/false.
  /** sha256 da chave de idempotência enviada pelo navegador — duplo clique devolve o mesmo pedido. */
  idempotencyHash: text("idempotency_hash").unique(),
  /** sha256 do conteúdo do envio; mesma chave com carrinho diferente é recusada. */
  requestFingerprint: text("request_fingerprint"),
  /** sha256 do token de acesso do pedido. O token original só vai no link de retorno. */
  accessTokenHash: text("access_token_hash"),
  /** Pedido criado com credenciais de TESTE — fora do faturamento e da fila de torra. */
  isTest: integer("is_test", { mode: "boolean" }).default(false),
  mpPreferenceId: text("mp_preference_id"),
  mpCheckoutUrl: text("mp_checkout_url"),
  /** ID do pagamento no Mercado Pago (diferente do ID da preference). */
  mpPaymentId: text("mp_payment_id"),
  /**
   * Situação do pagamento, separada do andamento (status): awaiting | preference_error |
   * pending | in_process | authorized | approved | rejected | cancelled | refunded |
   * charged_back | in_mediation.
   */
  paymentStatus: text("payment_status"),
  paymentStatusDetail: text("payment_status_detail"),
  paymentError: text("payment_error"),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  /** Última consulta ao Mercado Pago feita pelo retorno do checkout (limite de chamadas). */
  paymentCheckedAt: integer("payment_checked_at", { mode: "timestamp" }),

  // --- Bling: pedido de venda criado a partir do pedido pago (nunca para teste).
  blingOrderId: text("bling_order_id"),
  /** Número do pedido de venda no Bling (o que o tio vê na tela). */
  blingOrderNumber: text("bling_order_number"),
  /** sending | sent | error */
  blingStatus: text("bling_status"),
  blingError: text("bling_error"),
  blingAttempts: integer("bling_attempts").default(0),
  blingAttemptAt: integer("bling_attempt_at", { mode: "timestamp" }),
});

/**
 * Conexão com o Bling (linha única, id = 1). Tokens ficam cifrados com uma
 * chave derivada do BLING_CLIENT_SECRET — nunca no .env, porque giram sozinhos.
 */
export const blingConnection = sqliteTable("bling_connection", {
  id: integer("id").primaryKey(),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  accessExpiresAt: integer("access_expires_at", { mode: "timestamp" }),
  refreshExpiresAt: integer("refresh_expires_at", { mode: "timestamp" }),
  companyId: text("company_id"),
  companyName: text("company_name"),
  connectedAt: integer("connected_at", { mode: "timestamp" }),
  /** Primeira conexão: só pedidos pagos depois disso vão sozinhos pro Bling. */
  ordersSince: integer("orders_since", { mode: "timestamp" }),
  /** Precisa autorizar de novo (refresh recusado, segredo trocado…). */
  needsReconnect: integer("needs_reconnect", { mode: "boolean" }).notNull().default(false),
  lastError: text("last_error"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  lastSyncSummary: text("last_sync_summary", { mode: "json" }).$type<BlingSyncSummary>(),
  /** Categoria de produto do Bling cujos itens viram café no site. */
  cafeCategoryId: integer("cafe_category_id"),
  initialDepositId: integer("initial_deposit_id"),
  /** Canal de venda (loja) do Bling para marcar os pedidos do site. Opcional. */
  lojaId: integer("loja_id"),
  /** Forma de pagamento usada na parcela do pedido. Opcional. */
  formaPagamentoId: integer("forma_pagamento_id"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type BlingSyncSummary = {
  at: string;
  trigger: "manual" | "auto" | "connect";
  checked: number;
  updated: string[];
  created: string[];
  deactivated: string[];
  /** SKUs do site que não existem no Bling. */
  notFound: string[];
  error?: string | null;
};

/** Webhooks recebidos do Bling (auditoria + idempotência pelo eventId). */
export const blingEvents = sqliteTable("bling_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().unique(),
  event: text("event").notNull(),
  resourceId: text("resource_id"),
  /** processing | processed | ignored_* | error */
  outcome: text("outcome").notNull(),
  detail: text("detail"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/** Registro das notificações autenticadas recebidas do Mercado Pago (auditoria/teste). */
export const paymentEvents = sqliteTable("payment_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull().default("mercadopago"),
  requestId: text("request_id"),
  topic: text("topic"),
  action: text("action"),
  resourceId: text("resource_id"),
  liveMode: integer("live_mode", { mode: "boolean" }),
  /** processed | ignored_* | error_* — nunca guarda token nem dados de cartão. */
  outcome: text("outcome").notNull(),
  orderReference: text("order_reference"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/** Cache chave/valor de cálculos do site (ex.: mais vendidos da semana). */
export const siteCache = sqliteTable("site_cache", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id),
  name: text("name").notNull(),
  grind: text("grind").notNull().default("Grãos"),
  quantity: integer("quantity").notNull(),
  unitCents: integer("unit_cents").notNull(),
});

/**
 * "Conheça o seu café" — receitas em vídeo publicadas pelo Instagram da Kalango.
 * O tio cadastra pelo /gestao colando o link do reel; guardamos o shortcode
 * pra montar o player sem depender de token da API do Instagram.
 */
export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  /** Método/preparo, ex.: "V60", "Prensa francesa", "Origem" */
  method: text("method").notNull().default("Receita"),
  instagramUrl: text("instagram_url").notNull(),
  /** Código do post extraído da URL, ex.: DaLH9AiJ4cn */
  shortcode: text("shortcode").notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/** Textos editáveis de página (chave → valor), também mantidos pelo /gestao. */
export const siteTexts = sqliteTable("site_texts", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** contato | atacado | clube | newsletter | lifestyle */
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  plan: text("plan"),
  message: text("message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const newsletterSubscribers = sqliteTable("newsletter_subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("subscribed"),
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  source: text("source").notNull().default("newsletter"),
  subscribedAt: integer("subscribed_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp" }),
});

export const newsletterCampaigns = sqliteTable("newsletter_campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creationKey: text("creation_key").notNull().unique(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  /** draft | preparing | active | completed. Aceitação pelo provedor != entrega. */
  status: text("status").notNull().default("draft"),
  sendLock: text("send_lock"),
  lockAt: integer("lock_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const newsletterRecipients = sqliteTable("newsletter_recipients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").notNull().references(() => newsletterCampaigns.id),
  subscriberId: integer("subscriber_id").notNull().references(() => newsletterSubscribers.id),
  email: text("email").notNull(),
  /** queued | processing | accepted | failed | uncertain | skipped */
  status: text("status").notNull().default("queued"),
  providerId: text("provider_id"),
  error: text("error"),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
}, (t) => [uniqueIndex("newsletter_recipient_unique").on(t.campaignId, t.subscriberId)]);

export const newsletterBatches = sqliteTable("newsletter_batches", {
  id: text("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => newsletterCampaigns.id),
  status: text("status").notNull().default("processing"),
  recipientIds: text("recipient_ids", { mode: "json" }).$type<number[]>().notNull(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const orderEmails = sqliteTable("order_emails", {
  key: text("key").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  audience: text("audience").notNull(),
  /** pending | sending | accepted | failed | uncertain */
  status: text("status").notNull().default("pending"),
  providerId: text("provider_id"),
  error: text("error"),
  attemptedAt: integer("attempted_at", { mode: "timestamp" }),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
});

export type Product = typeof products.$inferSelect;
export type Merch = typeof merch.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type BlingConnection = typeof blingConnection.$inferSelect;
