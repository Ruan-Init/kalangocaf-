/**
 * Preload dos testes: banco SQLite descartável em /tmp e credenciais falsas.
 * Nunca toca no banco real nem na API real do Mercado Pago (fetch é simulado).
 */
import { rmSync } from "node:fs";

const file = `/tmp/kalango-test-${process.pid}.db`;
rmSync(file, { force: true });

process.env.DATABASE_URL = `file:${file}`;
delete process.env.DATABASE_AUTH_TOKEN;
delete process.env.RESEND_API_KEY;
delete process.env.MELHOR_ENVIO_TOKEN;
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-fake-test-token";
process.env.MERCADOPAGO_SELLER_ID = "999";
process.env.MERCADOPAGO_WEBHOOK_SECRET = "segredo-de-teste";
process.env.ORDER_ACCESS_SECRET = "s".repeat(48);
process.env.WEBSITE_URL = "https://loja.example.test/";
process.env.BLING_CLIENT_ID = "bling-client-teste";
process.env.BLING_CLIENT_SECRET = "bling-segredo-teste";
process.env.BLING_THROTTLE_MS = "0";

if (!process.env.DATABASE_URL.startsWith("file:/tmp/")) throw new Error("Banco de teste inválido");

const push = Bun.spawnSync(["bunx", "drizzle-kit", "push", "--force"], {
  cwd: `${import.meta.dir}/..`,
  env: { ...process.env },
  stdout: "pipe",
  stderr: "pipe",
});
if (push.exitCode !== 0) {
  throw new Error(`drizzle-kit push falhou: ${push.stderr.toString()}`);
}
