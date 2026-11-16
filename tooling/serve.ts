import { existsSync } from "node:fs";
import path from "node:path";
import ports from "../__ports.cjs";

// Foreground production entrypoint for Bun on a VPS or process supervisor.
const root = path.resolve(import.meta.dir, "..");
const envFile = path.join(root, ".env");
if (!existsSync(envFile)) {
  console.error("Falta o .env na raiz do projeto. Copie .env.template e preencha as credenciais.");
  process.exit(1);
}
if (!existsSync(path.join(root, "packages/web/dist/index.html"))) {
  console.error("Build não encontrado. Execute bun install e bun run build antes de bun run serve.");
  process.exit(1);
}
const child = Bun.spawn([process.execPath, `--env-file=${envFile}`, "packages/web/src/__server.ts"], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "production", PORT: process.env.PORT ?? String(ports.website) },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
process.exit(await child.exited);