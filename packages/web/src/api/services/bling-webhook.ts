/**
 * Rotas HTTP do Bling:
 * - GET  /api/bling/callback — volta da autorização OAuth (troca o code por tokens).
 * - POST /api/webhooks/bling — eventos de produto e estoque.
 *
 * Webhook: assinatura X-Bling-Signature-256 (HMAC do corpo com o client secret),
 * companyId tem que ser o da conta conectada, eventId repetido não reprocessa.
 * O Bling exige 2xx em até 5 s, então o processamento corre no máximo ~4 s
 * antes de responder (e continua em segundo plano se passar disso).
 */
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import {
  BlingError,
  checkState,
  exchangeCode,
  getConnection,
  isConnected,
  verifyBlingSignature,
} from "./bling-client";
import { retryPendingOrders } from "./bling-orders";
import {
  applyBlingProduct,
  applyStock,
  deactivateByBlingId,
  syncFromBling,
  type BlingProduct,
} from "./bling-sync";

const MAX_BODY_BYTES = 256 * 1024;
const RESPOND_WITHIN_MS = 4_000;

// ---------------------------------------------------------------- callback OAuth

export async function blingCallback(c: Context) {
  const back = (params: Record<string, string>) =>
    c.redirect(`/gestao?${new URLSearchParams({ aba: "bling", ...params }).toString()}`, 302);

  const error = c.req.query("error");
  if (error) return back({ bling: "erro", motivo: "Autorização cancelada no Bling." });

  const code = c.req.query("code");
  if (!code || !checkState(c.req.query("state"))) {
    return back({ bling: "erro", motivo: "Link de autorização expirado ou inválido. Tente de novo pelo painel." });
  }
  try {
    await exchangeCode(code);
  } catch (err) {
    const msg = err instanceof BlingError ? err.message : "Erro inesperado ao conectar.";
    console.error("[bling] callback:", msg);
    return back({ bling: "erro", motivo: msg.slice(0, 200) });
  }
  // Primeira leitura do catálogo logo após conectar (sem segurar o redirecionamento).
  void syncFromBling("connect")
    .then(() => retryPendingOrders())
    .catch((err) => console.error("[bling] sync pós-conexão:", (err as Error).message));
  return back({ bling: "conectado" });
}

// ---------------------------------------------------------------- webhook

type Envelope = {
  eventId?: string;
  date?: string;
  version?: string;
  event?: string;
  companyId?: string;
  data?: Record<string, unknown>;
};

async function startEvent(eventId: string, event: string, resourceId: string | null) {
  const inserted = await db
    .insert(schema.blingEvents)
    .values({ eventId, event, resourceId, outcome: "processing" })
    .onConflictDoNothing()
    .returning({ id: schema.blingEvents.id });
  if (inserted.length) return true;
  // Repetido: só reprocessa se a primeira tentativa falhou.
  const [prev] = await db.select().from(schema.blingEvents).where(eq(schema.blingEvents.eventId, eventId)).limit(1);
  if (prev?.outcome === "error") {
    await db.update(schema.blingEvents).set({ outcome: "processing" }).where(eq(schema.blingEvents.eventId, eventId));
    return true;
  }
  return false;
}

async function finishEvent(eventId: string, outcome: string, detail?: string | null) {
  await db
    .update(schema.blingEvents)
    .set({ outcome, detail: detail?.slice(0, 300) ?? null })
    .where(eq(schema.blingEvents.eventId, eventId));
}

/** Aplica um evento já autenticado. Exportado para os testes. */
export async function handleBlingEvent(env: Envelope) {
  const event = env.event ?? "";
  const data = (env.data ?? {}) as Record<string, unknown>;
  const [resource, action] = event.split(".");
  const conn = await getConnection();

  if (resource === "product") {
    const id = Number(data.id);
    if (!id) return "ignored_malformed";
    if (action === "deleted") return deactivateByBlingId(id);
    const r = await applyBlingProduct(data as unknown as BlingProduct, {
      cafeCategoryId: conn?.cafeCategoryId,
    });
    return r.result;
  }
  if (resource === "stock" || resource === "virtual_stock") {
    const produto = data.produto as { id?: number } | undefined;
    if (!produto?.id) return "ignored_malformed";
    return applyStock(Number(produto.id), data.saldoVirtualTotal as number | undefined);
  }
  return "ignored_resource";
}

export async function blingWebhook(c: Context) {
  const raw = await c.req.text();
  if (raw.length > MAX_BODY_BYTES) return c.json({ error: "too_large" }, 413);
  if (!verifyBlingSignature(raw, c.req.header("x-bling-signature-256"))) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  let env: Envelope;
  try {
    env = JSON.parse(raw) as Envelope;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!env.eventId || !env.event) return c.json({ error: "malformed" }, 400);

  const conn = await getConnection();
  if (!isConnected(conn)) return c.json({ ok: true, outcome: "ignored_not_connected" }, 200);
  if (conn?.companyId && env.companyId && env.companyId !== conn.companyId) {
    return c.json({ ok: true, outcome: "ignored_other_company" }, 200);
  }

  const data = (env.data ?? {}) as { id?: unknown; produto?: { id?: unknown } };
  const resourceId = String(data.id ?? data.produto?.id ?? "") || null;
  if (!(await startEvent(env.eventId, env.event, resourceId))) {
    return c.json({ ok: true, outcome: "duplicate" }, 200);
  }

  const eventId = env.eventId;
  const work = handleBlingEvent(env)
    .then(async (outcome) => {
      await finishEvent(eventId, outcome);
      return outcome;
    })
    .catch(async (err) => {
      const msg = (err as Error).message;
      console.error(`[bling] webhook ${env.event}:`, msg);
      await finishEvent(eventId, "error", msg).catch(() => {});
      return "error" as const;
    });

  const outcome = await Promise.race([
    work,
    new Promise<string>((r) => setTimeout(() => r("queued"), RESPOND_WITHIN_MS)),
  ]);
  // Erro de processamento → 500 para o Bling tentar de novo mais tarde.
  if (outcome === "error") return c.json({ ok: false }, 500);
  return c.json({ ok: true, outcome }, 200);
}
