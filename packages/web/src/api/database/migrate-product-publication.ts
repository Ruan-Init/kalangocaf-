/** Migração aditiva idempotente. Esta execução é restrita a SQLite local. */
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:")) throw new Error("Migração de revisão permitida apenas em banco file: local.");
const client = createClient({ url });
const publication: Record<string, string> = {
  creation_key: "TEXT", publication_status: "TEXT NOT NULL DEFAULT 'legacy'",
  publication_error: "TEXT", publication_attempt_at: "INTEGER",
  product_attempted: "INTEGER NOT NULL DEFAULT 0", stock_attempted: "INTEGER NOT NULL DEFAULT 0",
  initial_stock: "INTEGER NOT NULL DEFAULT 0", initial_deposit_id: "INTEGER",
};
const tables = {
  products: publication,
  merch: { ...publication, sku: "TEXT", bling_id: "INTEGER", bling_synced_at: "INTEGER",
    stock: "INTEGER NOT NULL DEFAULT 0", active: "INTEGER NOT NULL DEFAULT 1" },
  bling_connection: { initial_deposit_id: "INTEGER" },
};
const tx = await client.transaction("write");
try {
  for (const [table, fields] of Object.entries(tables)) {
    const columns = new Set((await tx.execute(`PRAGMA table_info(${table})`)).rows.map((r) => r.name));
    if (!columns.size) throw new Error(`Tabela ${table} ausente: não é um banco existente da Kalango.`);
    for (const [column, type] of Object.entries(fields)) {
      if (!columns.has(column)) await tx.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  await tx.execute("CREATE UNIQUE INDEX IF NOT EXISTS products_creation_key_unique ON products(creation_key)");
  await tx.execute("CREATE UNIQUE INDEX IF NOT EXISTS merch_creation_key_unique ON merch(creation_key)");
  await tx.execute("CREATE UNIQUE INDEX IF NOT EXISTS merch_bling_id_unique ON merch(bling_id)");
  await tx.commit();
  console.log("Migração aditiva de publicação aplicada ao banco local; dados anteriores preservados.");
} catch (err) {
  await tx.rollback();
  throw err;
} finally {
  tx.close(); client.close();
}