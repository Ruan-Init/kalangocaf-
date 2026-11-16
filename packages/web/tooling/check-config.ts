import { createClient } from "@libsql/client";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { existsSync } from "node:fs";
import path from "node:path";
import * as schema from "../src/api/database/schema";

// Read-only diagnostics. No seed, migration, payments, e-mails or ERP writes.
const root = path.resolve(import.meta.dir, "../../..");
let failures = 0;
const ok = (message: string) => console.log(`OK: ${message}`);
const fail = (message: string) => { failures++; console.error(`ERRO: ${message}`); };
const warn = (message: string) => console.warn(`PENDENTE: ${message}`);
const required = ["DATABASE_URL", "OPS_TOKEN", "ORDER_ACCESS_SECRET", "WEBSITE_URL"];
for (const key of required) {
  if (process.env[key]?.trim()) ok(`${key} configurado`);
  else fail(`${key} ausente no .env da raiz`);
}
if ((process.env.ORDER_ACCESS_SECRET?.length ?? 0) < 32) fail("ORDER_ACCESS_SECRET precisa de pelo menos 32 caracteres");
if (process.env.DATABASE_URL?.startsWith("libsql:") && !process.env.DATABASE_AUTH_TOKEN?.trim()) fail("DATABASE_AUTH_TOKEN ausente para Turso remoto");
try {
  const url = new URL(process.env.WEBSITE_URL ?? "");
  if (url.protocol !== "https:") fail("WEBSITE_URL precisa usar HTTPS para Mercado Pago");
  else ok("WEBSITE_URL HTTPS");
} catch { fail("WEBSITE_URL inválido"); }

if (process.env.DATABASE_URL) {
  const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
  try {
    for (const value of Object.values(schema)) {
      let table: ReturnType<typeof getTableConfig>;
      try { table = getTableConfig(value as Parameters<typeof getTableConfig>[0]); } catch { continue; }
      const columns = await db.execute(`PRAGMA table_info(${table.name})`);
      const names = new Set(columns.rows.map((row) => String(row.name)));
      const missing = table.columns.filter((column) => !names.has(column.name));
      if (missing.length) fail(`Banco: ${table.name} sem colunas ${missing.map((c) => c.name).join(", ")}. Não execute seed em produção.`);
    }
    if (!failures) ok("Banco acessível; schema compatível (somente leitura)");
    for (const table of ["products", "merch"]) {
      const rows = await db.execute(`SELECT images FROM ${table}`);
      const images = rows.rows.flatMap((row) => JSON.parse(String(row.images)) as string[]);
      for (const image of new Set(images)) {
        if (image.startsWith("/")) {
          if (!existsSync(path.join(root, "packages/web/public", image))) fail(`Imagem ausente: ${image}`);
        } else if (/^https?:/.test(image)) {
          try { const response = await fetch(image, { method: "HEAD", signal: AbortSignal.timeout(10000) }); if (!response.ok) warn(`Imagem externa respondeu HTTP ${response.status}. Confira o armazenamento.`); }
          catch { warn("Não foi possível verificar uma imagem externa. Confira o armazenamento."); }
        }
      }
      ok(`Catálogo ${table}: ${rows.rows.length} registros; imagens locais verificadas`);
    }
  } catch {
    fail("Não foi possível verificar o banco. Confira URL/token, rede e schema; nenhum dado foi alterado.");
  } finally { db.close(); }
}

const mpKeys = ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_PUBLIC_KEY", "MERCADOPAGO_SELLER_ID", "MERCADOPAGO_WEBHOOK_SECRET"];
if (process.env.MERCADOPAGO_ENV !== "production") warn("MERCADOPAGO_ENV não está em production");
for (const key of mpKeys) if (!process.env[key]?.trim()) fail(`${key} ausente`);
if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
  try {
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) fail(`Mercado Pago: credencial recusada, HTTP ${response.status}`);
    else {
      const seller = await response.json() as { id: number; site_id: string; tags?: string[] };
      if (String(seller.id) !== process.env.MERCADOPAGO_SELLER_ID) fail("Mercado Pago: vendedor não corresponde ao MERCADOPAGO_SELLER_ID");
      else if (seller.site_id !== "MLB" || seller.tags?.includes("test_user")) fail("Mercado Pago: esta conta não é um vendedor brasileiro de produção");
      else ok("Mercado Pago: vendedor de produção validado; nenhuma cobrança criada");
    }
  } catch { fail("Mercado Pago: falha de rede na verificação do vendedor"); }
}

const from = process.env.EMAIL_FROM?.trim();
const email = from?.match(/(?:<)?([^<>\s]+@[^<>\s]+)>?$/)?.[1];
const senderDomain = email?.split("@")[1]?.toLowerCase();
if (!email) fail("EMAIL_FROM inválido: use Nome <endereco@dominio-proprio.com.br>");
if (!process.env.RESEND_API_KEY?.trim()) fail("RESEND_API_KEY ausente");
else if (senderDomain) {
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401) fail("Resend: API key inválida");
    else if (response.status === 403) warn("Resend: chave sem permissão para consultar domínios. Verifique o domínio no painel; não foi enviado e-mail.");
    else if (!response.ok) fail(`Resend: verificação respondeu HTTP ${response.status}`);
    else {
      const data = await response.json() as { data: { name: string; status: string }[] };
      const domain = data.data.find((d) => d.name.toLowerCase() === senderDomain);
      if (!domain) fail("Resend: domínio do EMAIL_FROM não cadastrado nesta conta. Gmail não pode ser usado como remetente.");
      else if (domain.status !== "verified") fail(`Resend: domínio ${senderDomain} está ${domain.status}. Configure o DNS e clique em Verify no painel.`);
      else ok("Resend: domínio do remetente verificado; nenhum e-mail enviado");
    }
  } catch { fail("Resend: falha de rede ao verificar o domínio"); }
}
if (!process.env.BLING_CLIENT_ID || !process.env.BLING_CLIENT_SECRET) warn("Bling: credenciais ausentes");
else ok("Bling: credenciais presentes. OAuth precisa ser conectado/reconectado na Gestão.");
if (!process.env.MELHOR_ENVIO_TOKEN) warn("Melhor Envio sem token: cotação estimada de contingência, não cotação real.");

try {
  const response = await fetch(`${new URL(process.env.WEBSITE_URL!).origin}/api/health`, { signal: AbortSignal.timeout(15000) });
  const result = response.ok ? await response.json().catch(() => null) as { status?: string } | null : null;
  if (result?.status === "ok") ok("Domínio público responde à API do projeto");
  else warn("Domínio ainda não responde à API do projeto. Configure Bun e o proxy HTTPS; pagamentos precisam do webhook público.");
} catch { warn("Domínio público/API não verificável. Confira proxy HTTPS e DNS."); }

console.log(`\nDiagnóstico: ${failures} erro(s). Nenhum banco, pedido, pagamento, e-mail ou registro do ERP foi modificado.`);
process.exitCode = failures ? 1 : 0;