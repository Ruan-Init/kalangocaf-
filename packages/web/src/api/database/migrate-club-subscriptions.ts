import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ausente.");
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const tx = await client.transaction("write");

try {
  const orders = await tx.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'",
  );
  if (!orders.rows.length) {
    throw new Error("Tabela orders ausente: não é um banco existente da Kalango.");
  }
  await tx.execute(`
    CREATE TABLE IF NOT EXISTS club_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      reference TEXT NOT NULL,
      idempotency_hash TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'pix',
      status TEXT NOT NULL DEFAULT 'pending_payment',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_status_detail TEXT,
      mp_payment_id TEXT,
      mp_preapproval_id TEXT,
      mp_preapproval_url TEXT,
      preapproval_status TEXT,
      pix_code TEXT,
      pix_qr_code_base64 TEXT,
      pix_expires_at INTEGER,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      zip TEXT NOT NULL,
      street TEXT NOT NULL,
      number TEXT NOT NULL,
      complement TEXT,
      district TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      is_test INTEGER NOT NULL DEFAULT false,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    )
  `);
  const columns = new Set(
    (await tx.execute("PRAGMA table_info(club_subscriptions)")).rows.map((row) => row.name),
  );
  const additions: Record<string, string> = {
    payment_method: "TEXT NOT NULL DEFAULT 'pix'",
    mp_preapproval_id: "TEXT",
    mp_preapproval_url: "TEXT",
    preapproval_status: "TEXT",
  };
  for (const [column, type] of Object.entries(additions)) {
    if (!columns.has(column)) {
      await tx.execute(`ALTER TABLE club_subscriptions ADD COLUMN ${column} ${type}`);
    }
  }
  await tx.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS club_subscriptions_reference_unique ON club_subscriptions(reference)",
  );
  await tx.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS club_subscriptions_idempotency_hash_unique ON club_subscriptions(idempotency_hash)",
  );
  await tx.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS club_subscriptions_mp_payment_id_unique ON club_subscriptions(mp_payment_id)",
  );
  await tx.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS club_subscriptions_mp_preapproval_id_unique ON club_subscriptions(mp_preapproval_id)",
  );
  await tx.execute(`
    CREATE TABLE IF NOT EXISTS club_subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      subscription_id INTEGER NOT NULL REFERENCES club_subscriptions(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL,
      status TEXT NOT NULL,
      status_detail TEXT,
      amount_cents INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    )
  `);
  await tx.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS club_subscription_payments_payment_id_unique ON club_subscription_payments(payment_id)",
  );
  await tx.commit();
  console.log("Migração aditiva do Clube aplicada; nenhuma tabela existente foi alterada.");
} catch (error) {
  if (!tx.closed) await tx.rollback();
  throw error;
} finally {
  tx.close();
  client.close();
}
