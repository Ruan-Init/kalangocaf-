-- Estrutura sem dados; testes usam apenas SQLite em memória.
CREATE TABLE `bling_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`access_expires_at` integer,
	`refresh_expires_at` integer,
	`company_id` text,
	`company_name` text,
	`connected_at` integer,
	`orders_since` integer,
	`needs_reconnect` integer DEFAULT false NOT NULL,
	`last_error` text,
	`last_sync_at` integer,
	`last_sync_summary` text,
	`cafe_category_id` integer,
	`loja_id` integer,
	`forma_pagamento_id` integer,
	`updated_at` integer NOT NULL
, initial_deposit_id INTEGER);
CREATE TABLE `bling_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`event` text NOT NULL,
	`resource_id` text,
	`outcome` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`company` text,
	`plan` text,
	`message` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `merch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`tagline` text,
	`description` text,
	`tone` text DEFAULT 'jungle' NOT NULL,
	`price_cents` integer,
	`sizes` text DEFAULT '[]' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`released` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
, creation_key TEXT, publication_status TEXT NOT NULL DEFAULT 'legacy', publication_error TEXT, publication_attempt_at INTEGER, product_attempted INTEGER NOT NULL DEFAULT 0, stock_attempted INTEGER NOT NULL DEFAULT 0, initial_stock INTEGER NOT NULL DEFAULT 0, initial_deposit_id INTEGER, sku TEXT, bling_id INTEGER, bling_synced_at INTEGER, stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer,
	`name` text NOT NULL,
	`grind` text DEFAULT 'Grãos' NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cents` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`document` text NOT NULL,
	`zip` text NOT NULL,
	`street` text NOT NULL,
	`number` text NOT NULL,
	`complement` text,
	`district` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`shipping_method` text NOT NULL,
	`shipping_service_id` text,
	`shipping_tracking_code` text,
	`shipping_cents` integer DEFAULT 0 NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`payment_method` text DEFAULT 'mercadopago' NOT NULL,
	`payment_intent_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`idempotency_hash` text,
	`request_fingerprint` text,
	`access_token_hash` text,
	`is_test` integer DEFAULT false,
	`mp_preference_id` text,
	`mp_checkout_url` text,
	`mp_payment_id` text,
	`payment_status` text,
	`payment_status_detail` text,
	`payment_error` text,
	`paid_at` integer,
	`payment_checked_at` integer,
	`bling_order_id` text,
	`bling_order_number` text,
	`bling_status` text,
	`bling_error` text,
	`bling_attempts` integer DEFAULT 0,
	`bling_attempt_at` integer
);
CREATE TABLE `payment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text DEFAULT 'mercadopago' NOT NULL,
	`request_id` text,
	`topic` text,
	`action` text,
	`resource_id` text,
	`live_mode` integer,
	`outcome` text NOT NULL,
	`order_reference` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`price_cents` integer NOT NULL,
	`compare_at_cents` integer,
	`weight_grams` integer DEFAULT 250 NOT NULL,
	`short_description` text,
	`description` text,
	`story` text,
	`variety` text,
	`altitude` text,
	`process` text,
	`aroma` text,
	`flavor` text,
	`acidity` text,
	`body_note` text,
	`finish` text,
	`producer` text,
	`origin` text,
	`roast` text,
	`sca_score` real,
	`notes` text DEFAULT '[]' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`stock` integer DEFAULT 50 NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`bling_id` integer,
	`bling_name` text,
	`bling_synced_at` integer
, creation_key TEXT, publication_status TEXT NOT NULL DEFAULT 'legacy', publication_error TEXT, publication_attempt_at INTEGER, product_attempted INTEGER NOT NULL DEFAULT 0, stock_attempted INTEGER NOT NULL DEFAULT 0, initial_stock INTEGER NOT NULL DEFAULT 0, initial_deposit_id INTEGER);
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`method` text DEFAULT 'Receita' NOT NULL,
	`instagram_url` text NOT NULL,
	`shortcode` text NOT NULL,
	`description` text,
	`position` integer DEFAULT 0 NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
CREATE TABLE `site_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
CREATE TABLE `site_texts` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX `bling_events_event_id_unique` ON `bling_events` (`event_id`);
CREATE UNIQUE INDEX `merch_slug_unique` ON `merch` (`slug`);
CREATE UNIQUE INDEX `orders_reference_unique` ON `orders` (`reference`);
CREATE UNIQUE INDEX `orders_idempotency_hash_unique` ON `orders` (`idempotency_hash`);
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);
CREATE UNIQUE INDEX `products_bling_id_unique` ON `products` (`bling_id`);
CREATE UNIQUE INDEX products_creation_key_unique ON products(creation_key);
CREATE UNIQUE INDEX merch_creation_key_unique ON merch(creation_key);
CREATE UNIQUE INDEX merch_bling_id_unique ON merch(bling_id);
