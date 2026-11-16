import { createClient } from "@libsql/client";
import { newsletterLegacySql, newsletterSchemaSql } from "./newsletter-schema";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("file:")) throw new Error("Migração permitida somente em banco SQLite local file:.");
const client = createClient({ url });
const before = await client.execute("SELECT count(*) AS total FROM orders");
const tx = await client.transaction("write");
try {
  for (const statement of (newsletterSchemaSql + newsletterLegacySql).split(";").map((s) => s.trim()).filter(Boolean)) await tx.execute(statement);
  await tx.commit();
  const after = await client.execute("SELECT count(*) AS total FROM orders");
  if (before.rows[0].total !== after.rows[0].total) throw new Error("Contagem de pedidos mudou inesperadamente");
  const subscribers = await client.execute("SELECT count(*) AS total FROM newsletter_subscribers");
  console.log(`Migração aditiva concluída: ${subscribers.rows[0].total} inscrito(s), pedidos preservados.`);
} catch (e) {
  if (!tx.closed) await tx.rollback();
  throw e;
} finally { tx.close(); client.close(); }