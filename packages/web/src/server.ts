import { serve } from "@hono/node-server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./api";

const port = Number(process.env.PORT ?? 3000);
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(sourceDir, "../dist");
const indexPath = path.join(distDir, "index.html");

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

serve({
  hostname: "0.0.0.0",
  port,
  fetch: async (request) => {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api")) {
      return app.fetch(request);
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch (error) {
      if (error instanceof URIError) {
        return new Response("Invalid URL", { status: 400 });
      }
      throw error;
    }

    const filePath = path.resolve(distDir, `.${pathname}`);
    const relativePath = path.relative(distDir, filePath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      return new Response("Not found", { status: 404 });
    }

    const file = await readStaticFile(filePath);
    if (file) {
      const contentType =
        contentTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      return new Response(file, { headers: { "Content-Type": contentType } });
    }

    const index = await readStaticFile(indexPath);
    if (index) {
      return new Response(index, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Build output not found. Run `npm run build` first.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
});

console.log(`Web server listening on http://0.0.0.0:${port}`);

async function readStaticFile(filePath: string) {
  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      return undefined;
    }
    return await readFile(filePath);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return undefined;
    }
    throw error;
  }
}
