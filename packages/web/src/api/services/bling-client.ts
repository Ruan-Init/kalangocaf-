/**
 * Bling API v3 — OAuth2 (authorization code) e chamadas autenticadas.
 *
 * - Tokens giram sozinhos (access ~6 h, refresh 30 dias e rotativo), por isso
 *   moram no banco (cifrados), não no .env. O .env só tem client id/secret.
 * - Header `enable-jwt: 1` em tudo: o token opaco foi descontinuado pelo Bling.
 * - Limite do Bling: 3 req/s. Todas as chamadas passam por uma fila com
 *   intervalo mínimo; 429 espera e tenta de novo; 401 renova o token uma vez.
 * - Mensagens de erro nunca levam token nem segredo.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";

export const BLING_API = "https://api.bling.com.br/Api/v3";
const AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const TIMEOUT_MS = 12_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
const STATE_TTL_MS = 10 * 60_000;
const ROW_ID = 1;

export class BlingError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  /** not_configured | not_connected | reconnect | api | network */
  readonly kind: string;
  constructor(message: string, opts: { kind: string; status?: number | null; retryable?: boolean }) {
    super(message);
    this.name = "BlingError";
    this.kind = opts.kind;
    this.status = opts.status ?? null;
    this.retryable = opts.retryable ?? false;
  }
}

export function blingConfigured() {
  return Boolean(process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET);
}

function creds() {
  const id = process.env.BLING_CLIENT_ID;
  const secret = process.env.BLING_CLIENT_SECRET;
  if (!id || !secret) {
    throw new BlingError("Bling não configurado: faltam BLING_CLIENT_ID/BLING_CLIENT_SECRET", {
      kind: "not_configured",
    });
  }
  return { id, secret };
}

export function siteOrigin() {
  return (process.env.WEBSITE_URL ?? "").replace(/\/$/, "");
}

export function blingRedirectUrl() {
  return `${siteOrigin()}/api/bling/callback`;
}

export function blingWebhookUrl() {
  return `${siteOrigin()}/api/webhooks/bling`;
}

// ---------------------------------------------------------------- cifra dos tokens

function key() {
  return createHash("sha256").update(`kalango-bling-tokens:${creds().secret}`).digest();
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function unseal(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    // Segredo trocado: o token antigo não abre mais — precisa reconectar.
    return null;
  }
}

// ---------------------------------------------------------------- state do OAuth

function stateSig(payload: string) {
  return createHmac("sha256", `kalango-bling-state:${creds().secret}`).update(payload).digest("base64url");
}

export function newState(now = Date.now()) {
  const payload = `${now}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${stateSig(payload)}`;
}

export function checkState(state: string | null | undefined, now = Date.now()) {
  if (!state) return false;
  const i = state.lastIndexOf(".");
  if (i < 0) return false;
  const payload = state.slice(0, i);
  const sig = Buffer.from(state.slice(i + 1));
  const expected = Buffer.from(stateSig(payload));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return false;
  const ts = Number(payload.split(".")[0]);
  return Number.isFinite(ts) && now - ts >= 0 && now - ts < STATE_TTL_MS;
}

export function authorizeUrl() {
  const { id } = creds();
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", blingRedirectUrl());
  u.searchParams.set("state", newState());
  return u.toString();
}

/** Assinatura dos webhooks: `X-Bling-Signature-256: sha256=<hex HMAC(body, client_secret)>`. */
export function verifyBlingSignature(body: string, header: string | null | undefined) {
  if (!header || !blingConfigured()) return false;
  const got = header.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(got)) return false;
  const expected = createHmac("sha256", creds().secret).update(body, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(got.toLowerCase()), Buffer.from(expected));
}

export function signBlingBody(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------- conexão (banco)

export async function getConnection() {
  const [row] = await db
    .select()
    .from(schema.blingConnection)
    .where(eq(schema.blingConnection.id, ROW_ID))
    .limit(1);
  return row ?? null;
}

export async function updateConnection(values: Partial<typeof schema.blingConnection.$inferInsert>) {
  const set = { ...values, updatedAt: new Date() };
  await db
    .insert(schema.blingConnection)
    .values({ id: ROW_ID, ...set })
    .onConflictDoUpdate({ target: schema.blingConnection.id, set });
}

export function isConnected(row: schema.BlingConnection | null) {
  return Boolean(row?.refreshTokenEnc && !row.needsReconnect);
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = creds();
  let res: Response;
  try {
    res = await throttled(() =>
      fetch(`${BLING_API}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "1.0",
          "enable-jwt": "1",
        },
        body: new URLSearchParams(body).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    );
  } catch {
    throw new BlingError("Falha de rede ao falar com o Bling (token)", { kind: "network", retryable: true });
  }
  if (!res.ok) {
    const detail = await errorText(res);
    const kind = res.status === 400 || res.status === 401 ? "reconnect" : "api";
    throw new BlingError(`Bling recusou o token (${res.status})${detail ? `: ${detail}` : ""}`, {
      kind,
      status: res.status,
      retryable: res.status >= 500 || res.status === 429,
    });
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token || !json.refresh_token) {
    throw new BlingError("Resposta de token do Bling sem access/refresh token", { kind: "api" });
  }
  return json;
}

function tokenColumns(t: TokenResponse, now = Date.now()) {
  return {
    accessTokenEnc: seal(t.access_token),
    refreshTokenEnc: seal(t.refresh_token),
    accessExpiresAt: new Date(now + Math.max(60, Number(t.expires_in) || 21_600) * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    needsReconnect: false,
    lastError: null,
  };
}

/** Troca o code do callback por tokens e guarda a conexão. O code vale 1 minuto. */
export async function exchangeCode(code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code });
  const prev = await getConnection();
  const now = new Date();
  await updateConnection({
    ...tokenColumns(t),
    connectedAt: now,
    ordersSince: prev?.ordersSince ?? now,
  });
  // Empresa conectada: usada para conferir o companyId dos webhooks.
  try {
    const info = await blingFetch<{ data: { id: string; nome?: string } }>("/empresas/me/dados-basicos");
    await updateConnection({ companyId: info.data.id, companyName: info.data.nome ?? null });
  } catch (err) {
    console.error("[bling] dados da empresa:", (err as Error).message);
  }
}

let refreshing: Promise<string> | null = null;

async function refreshAccess(row: schema.BlingConnection): Promise<string> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = unseal(row.refreshTokenEnc);
    if (!refreshToken) {
      await updateConnection({ needsReconnect: true, lastError: "Token guardado não abre (segredo trocado?). Conecte de novo." });
      throw new BlingError("Conexão com o Bling precisa ser refeita", { kind: "reconnect" });
    }
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      await updateConnection(tokenColumns(t));
      return t.access_token;
    } catch (err) {
      if (err instanceof BlingError && err.kind === "reconnect") {
        await updateConnection({
          needsReconnect: true,
          lastError: "O Bling recusou a renovação do acesso. Clique em Conectar de novo.",
        });
      }
      throw err;
    }
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

async function accessToken(force = false) {
  const row = await getConnection();
  if (!row?.refreshTokenEnc) {
    throw new BlingError("Bling ainda não foi conectado", { kind: "not_connected" });
  }
  if (row.needsReconnect) {
    throw new BlingError("Conexão com o Bling precisa ser refeita", { kind: "reconnect" });
  }
  const access = unseal(row.accessTokenEnc);
  const fresh = row.accessExpiresAt && row.accessExpiresAt.getTime() - Date.now() > 90_000;
  if (!force && access && fresh) return access;
  return refreshAccess(row);
}

// ---------------------------------------------------------------- fila (3 req/s)

let nextSlot = 0;

function minInterval() {
  const v = Number(process.env.BLING_THROTTLE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 380;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + minInterval();
  if (at > now) await sleep(at - now);
  return fn();
}

async function errorText(res: Response) {
  try {
    const j = (await res.json()) as {
      error?: { message?: string; description?: string; fields?: { msg?: string }[] };
      error_description?: string;
    };
    const fields = (j.error?.fields ?? []).map((f) => f.msg).filter(Boolean).join("; ");
    return [j.error?.message, j.error?.description, fields, j.error_description]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 300);
  } catch {
    return "";
  }
}

type FetchInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Criação sem idempotência do ERP: nunca repetir após resposta ambígua. */
  noRetry?: boolean;
  body?: unknown;
  query?: Record<string, string | number | (string | number)[] | undefined>;
};

export async function blingFetch<T>(path: string, init: FetchInit = {}): Promise<T> {
  const url = new URL(`${BLING_API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, String(item));
    else url.searchParams.set(k, String(v));
  }
  const label = `${init.method ?? "GET"} ${path.replace(/\/\d+/g, "/:id")}`;

  let token = await accessToken();
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await throttled(() =>
        fetch(url, {
          method: init.method ?? "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "enable-jwt": "1",
            ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      );
    } catch {
      if (!init.noRetry && attempt < 3) {
        await sleep(600 * attempt);
        continue;
      }
      throw new BlingError(`Falha de rede ao chamar o Bling (${label})`, { kind: "network", retryable: true });
    }

    if (!init.noRetry && res.status === 401 && attempt === 1) {
      token = await accessToken(true);
      continue;
    }
    if (!init.noRetry && res.status === 429 && attempt < 4) {
      await sleep(1100 * attempt);
      continue;
    }
    if (!init.noRetry && res.status >= 500 && attempt < 3) {
      await sleep(800 * attempt);
      continue;
    }
    if (res.status === 204) return undefined as T;
    if (!res.ok) {
      const detail = await errorText(res);
      throw new BlingError(`Bling respondeu ${res.status} em ${label}${detail ? `: ${detail}` : ""}`, {
        kind: "api",
        status: res.status,
        retryable: res.status >= 500 || res.status === 429,
      });
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** Esquece os tokens (o Bling continua com o app autorizado até revogar lá). */
export async function disconnect() {
  await updateConnection({
    accessTokenEnc: null,
    refreshTokenEnc: null,
    accessExpiresAt: null,
    refreshExpiresAt: null,
    needsReconnect: false,
    lastError: null,
  });
}
