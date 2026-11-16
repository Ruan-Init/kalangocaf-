/**
 * Guarda no navegador o que a loja precisa sem login:
 * - token de acesso de cada pedido (para reabrir /pedido/:ref nesta máquina);
 * - chave de idempotência da tentativa de checkout atual (duplo clique/reenvio
 *   devolvem o mesmo pedido; carrinho/dados diferentes geram outra chave).
 */

const TOKENS_KEY = "kalango.orders.v1";
const ATTEMPT_KEY = "kalango.checkout.attempt.v1";

function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveOrderToken(reference: string, token: string) {
  const all = readTokens();
  delete all[reference];
  all[reference] = token;
  // Só os 20 mais recentes.
  const entries = Object.entries(all).slice(-20);
  localStorage.setItem(TOKENS_KEY, JSON.stringify(Object.fromEntries(entries)));
}

export function getOrderToken(reference: string) {
  return readTokens()[reference] ?? null;
}

/** Mesma chave enquanto o conteúdo do envio for o mesmo. */
export function idempotencyKeyFor(payload: unknown) {
  const fingerprint = JSON.stringify(payload);
  try {
    const saved = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "null") as
      | { fingerprint: string; key: string }
      | null;
    if (saved && saved.fingerprint === fingerprint) return saved.key;
  } catch {
    // ignora e gera outra
  }
  const key = randomKey();
  sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ fingerprint, key }));
  return key;
}

export function clearCheckoutAttempt() {
  sessionStorage.removeItem(ATTEMPT_KEY);
}

/** Só segue para páginas oficiais do Mercado Pago. */
export function isMercadoPagoUrl(raw: string) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      ["www.mercadopago.com.br", "mercadopago.com.br", "sandbox.mercadopago.com.br"].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
