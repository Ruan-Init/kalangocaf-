/**
 * Painel → Bling. Tudo protegido pela senha de operação (OPS_TOKEN).
 */
import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import {
  authorizeUrl,
  BlingError,
  blingConfigured,
  blingFetch,
  blingRedirectUrl,
  blingWebhookUrl,
  disconnect,
  getConnection,
  isConnected,
  updateConnection,
} from "../services/bling-client";
import { pushOrderToBling, retryPendingOrders } from "../services/bling-orders";
import { linkedProducts, syncFromBling, syncRunning } from "../services/bling-sync";
import { assertOps } from "./admin";

const withToken = z.object({ token: z.string().min(1) });

function fail(err: unknown): never {
  if (err instanceof BlingError) {
    throw new ORPCError(err.kind === "api" || err.kind === "network" ? "BAD_GATEWAY" : "PRECONDITION_FAILED", {
      message: err.message,
    });
  }
  throw err;
}

export const bling = {
  /** Situação da integração — tela do painel. Nunca devolve token. */
  status: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    const conn = await getConnection();
    const pendentes = await db
      .select({
        reference: schema.orders.reference,
        customerName: schema.orders.customerName,
        blingStatus: schema.orders.blingStatus,
        blingError: schema.orders.blingError,
        paidAt: schema.orders.paidAt,
      })
      .from(schema.orders)
      .where(
        and(
          isNotNull(schema.orders.paidAt),
          isNull(schema.orders.blingOrderId),
          ne(schema.orders.status, "cancelled"),
          or(eq(schema.orders.isTest, false), isNull(schema.orders.isTest))
        )
      )
      .orderBy(desc(schema.orders.paidAt))
      .limit(30);
    return {
      configured: blingConfigured(),
      connected: isConnected(conn),
      needsReconnect: Boolean(conn?.needsReconnect),
      companyName: conn?.companyName ?? null,
      connectedAt: conn?.connectedAt ?? null,
      ordersSince: conn?.ordersSince ?? null,
      refreshExpiresAt: conn?.refreshTokenEnc ? conn.refreshExpiresAt : null,
      lastError: conn?.lastError ?? null,
      lastSyncAt: conn?.lastSyncAt ?? null,
      lastSync: conn?.lastSyncSummary ?? null,
      syncing: syncRunning(),
      settings: {
        cafeCategoryId: conn?.cafeCategoryId ?? null,
        initialDepositId: conn?.initialDepositId ?? null,
        lojaId: conn?.lojaId ?? null,
        formaPagamentoId: conn?.formaPagamentoId ?? null,
      },
      redirectUrl: blingRedirectUrl(),
      webhookUrl: blingWebhookUrl(),
      products: await linkedProducts(),
      pendingOrders: pendentes,
    };
  }),

  /** Link para autorizar o app no Bling (state assinado, vale 10 min). */
  authorizeUrl: base.input(withToken).handler(({ input }) => {
    assertOps(input.token);
    try {
      return { url: authorizeUrl() };
    } catch (err) {
      fail(err);
    }
  }),

  disconnect: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    await disconnect();
    return { ok: true };
  }),

  /** Listas do Bling para as escolhas do painel. */
  options: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    try {
      const [cats, canais, formas, depositos] = await Promise.all([
        blingFetch<{ data: { id: number; descricao: string; categoriaPai?: { id: number } }[] }>(
          "/categorias/produtos",
          { query: { limite: 100 } }
        ),
        blingFetch<{ data: { id: number; descricao: string; tipo?: string; situacao?: number }[] }>(
          "/canais-venda",
          { query: { limite: 100 } }
        ).catch(() => ({ data: [] })),
        blingFetch<{ data: { id: number; descricao: string; situacao?: number }[] }>(
          "/formas-pagamentos",
          { query: { limite: 100 } }
        ).catch(() => ({ data: [] })),
        blingFetch<{ data: { id: number; descricao: string; situacao: number; desconsiderarSaldo: boolean }[] }>(
          "/depositos", { query: { limite: 100, situacao: 1 } }
        ).then((r) => ({ ...r, warning: null as string | null })).catch((err: unknown) => ({
          data: [],
          warning: err instanceof BlingError && err.status === 403
            ? "Bling recusou a leitura de depósitos (403). Habilite essa permissão no aplicativo do Bling e reconecte a conta. Cafés com estoque inicial positivo aguardam a escolha do depósito."
            : `Não foi possível listar depósitos: ${err instanceof Error ? err.message : "erro de integração"}`,
        })),
      ]);
      return {
        depositosWarning: depositos.warning,
        depositos: (depositos.data ?? []).filter((d) => d.situacao === 1 && !d.desconsiderarSaldo).map((d) => ({ id: d.id, nome: d.descricao })),
        categorias: (cats.data ?? []).map((c) => ({ id: c.id, nome: c.descricao })),
        canais: (canais.data ?? [])
          .filter((c) => c.situacao !== 2)
          .map((c) => ({ id: c.id, nome: c.tipo ? `${c.descricao} (${c.tipo})` : c.descricao })),
        formas: (formas.data ?? [])
          .filter((f) => f.situacao !== 0)
          .map((f) => ({ id: f.id, nome: f.descricao })),
      };
    } catch (err) {
      fail(err);
    }
  }),

  saveSettings: base
    .input(
      withToken.extend({
        cafeCategoryId: z.number().int().positive().nullable(),
        initialDepositId: z.number().int().positive().nullable().optional(),
        lojaId: z.number().int().positive().nullable(),
        formaPagamentoId: z.number().int().positive().nullable(),
      })
    )
    .handler(async ({ input }) => {
      assertOps(input.token);
      await updateConnection({
        cafeCategoryId: input.cafeCategoryId,
        ...(input.initialDepositId !== undefined ? { initialDepositId: input.initialDepositId } : {}),
        lojaId: input.lojaId,
        formaPagamentoId: input.formaPagamentoId,
      });
      return { ok: true };
    }),

  /** Puxa preço/estoque/nome/descrição agora e reenvia pedidos pendentes. */
  sync: base.input(withToken).handler(async ({ input }) => {
    assertOps(input.token);
    const conn = await getConnection();
    if (!isConnected(conn)) {
      throw new ORPCError("PRECONDITION_FAILED", { message: "Conecte o Bling primeiro." });
    }
    const summary = await syncFromBling("manual");
    const ordersSent = await retryPendingOrders().catch(() => 0);
    return { summary, ordersSent };
  }),

  /** Envia (ou reenvia) um pedido pago específico. */
  pushOrder: base
    .input(withToken.extend({ reference: z.string().min(1) }))
    .handler(async ({ input }) => {
      assertOps(input.token);
      const [order] = await db
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.reference, input.reference))
        .limit(1);
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Pedido não encontrado" });
      const r = await pushOrderToBling(order.id);
      if (!r.ok) throw new ORPCError("BAD_REQUEST", { message: r.reason });
      return r;
    }),
};
