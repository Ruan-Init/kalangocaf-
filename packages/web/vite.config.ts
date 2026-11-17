import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import runableAnalyticsPlugin from "./vite/__plugins/runable-analytics-plugin";
import honoDevPlugin from "./vite/__plugins/hono-dev-plugin";
import assetOptimizerPlugin from "./vite/__plugins/asset-optimizer-plugin";

const repositoryRoot = path.resolve(__dirname, "../..");
const isMonorepo = existsSync(path.join(repositoryRoot, "__ports.cjs"));
const root = isMonorepo ? repositoryRoot : __dirname;
const ports = isMonorepo
  ? (createRequire(import.meta.url)("../../__ports.cjs") as { website: number })
  : { website: 4200 };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  Object.assign(process.env, env);
  // Never let a copied development .env make the production bundle use React's dev runtime.
  process.env.NODE_ENV = mode === "production" ? "production" : "development";

  return {
    // All env files live at the repo root — keep Vite's own env loading there too,
    // so packages/web/.env* files can never shadow the root .env.
    envDir: root,
    plugins: [
      honoDevPlugin(),
      react(),
      runableAnalyticsPlugin(),
      tailwind(),
      assetOptimizerPlugin(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/web"),
      },
    },
    server: {
      // Bind every interface: localhost resolves to ::1 only, and the platform proxy
      // reaches the dev server over 127.0.0.1 — that mismatch shows up as a 502.
      host: "0.0.0.0",
      port: ports.website,
      strictPort: true,
      allowedHosts: true,
      hmr: { overlay: false },
      cors: false,
    },
  };
});
