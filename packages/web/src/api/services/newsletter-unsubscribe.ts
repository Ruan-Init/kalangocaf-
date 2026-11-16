import type { Context } from "hono";
import { unsubscribeNewsletter } from "./newsletter";

/** RFC 8058 one-click via POST. GET nunca altera inscrições (scanners de e-mail). */
export async function newsletterOneClick(c: Context) {
  const token = new URL(c.req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return c.json({ error: "invalid_token" }, 400);
  if (Number(c.req.header("content-length") ?? 0) > 1024) return c.json({ error: "payload_too_large" }, 413);
  const body = await c.req.text();
  if (body.length > 1024) return c.json({ error: "payload_too_large" }, 413);
  if (new URLSearchParams(body).get("List-Unsubscribe") !== "One-Click") return c.json({ error: "invalid_request" }, 400);
  try {
    await unsubscribeNewsletter(token);
    return c.json({ ok: true }, 200);
  } catch {
    return c.json({ error: "invalid_subscription" }, 404);
  }
}