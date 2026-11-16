/**
 * Acesso a pedidos sem login.
 *
 * - O navegador gera a chave de idempotência (aleatória, alta entropia) de cada
 *   tentativa de checkout. No banco fica só o sha256 dela.
 * - O token de acesso do pedido é HMAC(ORDER_ACCESS_SECRET, referência + chave).
 *   Assim um reenvio com a mesma chave devolve o mesmo token sem que o token
 *   fique gravado; no banco fica só o sha256 do token.
 * - Código de pedido sozinho não abre nada.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function secret() {
  const s = process.env.ORDER_ACCESS_SECRET;
  if (!s || s.length < 32) throw new Error("ORDER_ACCESS_SECRET ausente ou curto");
  return s;
}

export function orderAccessReady() {
  return (process.env.ORDER_ACCESS_SECRET?.length ?? 0) >= 32;
}

/** Token de acompanhamento no e-mail, sem depender da chave que só o navegador tem. */
export function deriveEmailAccessToken(reference: string) {
  return createHmac("sha256", secret()).update(`order-email-access:${reference}`).digest("base64url");
}

export function emailTokenMatches(token: string, reference: string) {
  if (!orderAccessReady() || token.length < 40) return false;
  return tokenMatches(token, sha256(deriveEmailAccessToken(reference)));
}

export function deriveAccessToken(reference: string, idempotencyKey: string) {
  return createHmac("sha256", secret())
    .update(`order-access:${reference}:${idempotencyKey}`)
    .digest("base64url");
}

export function tokenMatches(token: string | null | undefined, storedHash: string | null | undefined) {
  if (!token || !storedHash) return false;
  const a = Buffer.from(sha256(token));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Referência não sequencial: KLG- + 10 caracteres sem ambiguidade (≈50 bits). */
export function newReference() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `KLG-${out}`;
}
