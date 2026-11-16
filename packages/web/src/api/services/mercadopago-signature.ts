/**
 * Validação do `x-signature` dos webhooks do Mercado Pago.
 *
 * Manifesto documentado (mesmo algoritmo do SDK oficial):
 *   id:[data.id da URL];request-id:[x-request-id];ts:[ts do header];
 * Pares sem valor são omitidos; `data.id` alfanumérico vai em minúsculas.
 * HMAC-SHA256 com a assinatura secreta da aplicação, comparação em tempo constante.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureResult =
  | { ok: true; ts: string }
  | { ok: false; reason: "missing_secret" | "missing_signature" | "malformed" | "mismatch" };

export function parseSignatureHeader(header: string) {
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const key = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (!value) continue;
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  return { ts, v1 };
}

export function buildManifest(dataId: string | undefined, requestId: string | undefined, ts: string) {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return `${parts.join(";")};`;
}

export function signManifest(manifest: string, secret: string) {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyWebhookSignature(input: {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string | null | undefined;
  secret: string | null | undefined;
}): SignatureResult {
  if (!input.secret) return { ok: false, reason: "missing_secret" };
  const header = input.xSignature?.trim();
  if (!header) return { ok: false, reason: "missing_signature" };
  const { ts, v1 } = parseSignatureHeader(header);
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[a-f0-9]{64}$/i.test(v1)) {
    return { ok: false, reason: "malformed" };
  }
  const manifest = buildManifest(
    input.dataId?.trim() || undefined,
    input.xRequestId?.trim() || undefined,
    ts
  );
  const expected = signManifest(manifest, input.secret);
  if (!safeEqualHex(expected, v1.toLowerCase())) return { ok: false, reason: "mismatch" };
  return { ok: true, ts };
}
