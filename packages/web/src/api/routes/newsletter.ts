import { ORPCError } from "@orpc/server";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as s from "../database/schema";
import { assertOps } from "./admin";
import { mailConfiguration } from "../services/mail-transport";
import { campaignById, campaignStats, prepareCampaign, recoverCampaign, sendCampaignChunk, unsubscribeNewsletter } from "../services/newsletter";

const tokenInput = z.object({ token: z.string().min(1) });
const campaignInput = tokenInput.extend({ id: z.number().int().positive() });
const subscriberFilter = tokenInput.extend({ search: z.string().trim().max(120).default(""), status: z.enum(["all", "subscribed", "unsubscribed"]).default("all") });
const subscriberColumns = { id: s.newsletterSubscribers.id, email: s.newsletterSubscribers.email, name: s.newsletterSubscribers.name, status: s.newsletterSubscribers.status,
  source: s.newsletterSubscribers.source, subscribedAt: s.newsletterSubscribers.subscribedAt, unsubscribedAt: s.newsletterSubscribers.unsubscribedAt };
function filter(input: z.infer<typeof subscriberFilter>) {
  const pattern = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
  return and(input.status === "all" ? undefined : eq(s.newsletterSubscribers.status, input.status),
    input.search ? sql`(${s.newsletterSubscribers.email} like ${pattern} escape '\\' or ${s.newsletterSubscribers.name} like ${pattern} escape '\\')` : undefined);
}
function csvCell(value: unknown) {
  let v = String(value ?? "");
  if (/^\s*[=+@-]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export const newsletter = {
  summary: base.input(tokenInput).handler(async ({ input }) => {
    assertOps(input.token);
    const grouped = await db.select({ status: s.newsletterSubscribers.status, total: count() }).from(s.newsletterSubscribers).groupBy(s.newsletterSubscribers.status);
    return { configuration: mailConfiguration(), active: grouped.find((r) => r.status === "subscribed")?.total ?? 0,
      unsubscribed: grouped.find((r) => r.status === "unsubscribed")?.total ?? 0,
      total: grouped.reduce((n, r) => n + r.total, 0) };
  }),
  subscribers: base.input(subscriberFilter.extend({ page: z.number().int().min(1).default(1) })).handler(async ({ input }) => {
    assertOps(input.token);
    const where = filter(input);
    const [n] = await db.select({ total: count() }).from(s.newsletterSubscribers).where(where);
    const rows = await db.select(subscriberColumns).from(s.newsletterSubscribers).where(where).orderBy(desc(s.newsletterSubscribers.subscribedAt), desc(s.newsletterSubscribers.id)).limit(50).offset((input.page - 1) * 50);
    return { rows, total: n.total, page: input.page, pages: Math.max(1, Math.ceil(n.total / 50)) };
  }),
  exportSubscribers: base.input(subscriberFilter).handler(async ({ input }) => {
    assertOps(input.token);
    const [n] = await db.select({ total: count() }).from(s.newsletterSubscribers).where(filter(input));
    if (n.total > 10000) throw new ORPCError("BAD_REQUEST", { message: "Use os filtros para exportar até 10.000 inscritos por arquivo." });
    const rows = await db.select(subscriberColumns).from(s.newsletterSubscribers).where(filter(input)).orderBy(desc(s.newsletterSubscribers.id));
    const csv = ["Nome;Email;Status;Origem;Inscrição;Cancelamento", ...rows.map((r) => [r.name, r.email, r.status, r.source, r.subscribedAt.toISOString(), r.unsubscribedAt?.toISOString() ?? ""].map(csvCell).join(";"))].join("\r\n");
    return { filename: "kalango-newsletter.csv", csv: "﻿" + csv, count: rows.length };
  }),
  unsubscribeSubscriber: base.input(tokenInput.extend({ id: z.number().int().positive() })).handler(async ({ input }) => {
    assertOps(input.token);
    const [row] = await db.select().from(s.newsletterSubscribers).where(eq(s.newsletterSubscribers.id, input.id)).limit(1);
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Inscrito não encontrado." });
    return unsubscribeNewsletter(row.unsubscribeToken);
  }),
  campaigns: base.input(tokenInput).handler(async ({ input }) => {
    assertOps(input.token);
    const campaigns = await db.select().from(s.newsletterCampaigns).orderBy(desc(s.newsletterCampaigns.id)).limit(100);
    return Promise.all(campaigns.map(async ({ sendLock, ...c }) => ({ ...c, locked: Boolean(sendLock), counts: await campaignStats(c.id) })));
  }),
  saveCampaign: base.input(tokenInput.extend({ id: z.number().int().positive().optional(), creationKey: z.string().uuid(), subject: z.string().trim().min(3).max(150).refine((s) => !/[\r\n]/.test(s), "Assunto deve ter uma única linha."), message: z.string().trim().min(10).max(12000) })).handler(async ({ input }) => {
    assertOps(input.token);
    let id = input.id;
    if (!id) {
      const [existing] = await db.select().from(s.newsletterCampaigns).where(eq(s.newsletterCampaigns.creationKey, input.creationKey)).limit(1);
      id = existing?.id;
    }
    if (id) {
      const [row] = await db.update(s.newsletterCampaigns).set({ subject: input.subject, message: input.message })
        .where(and(eq(s.newsletterCampaigns.id, id), eq(s.newsletterCampaigns.status, "draft"))).returning();
      if (!row) throw new ORPCError("CONFLICT", { message: "Campanha já iniciada: conteúdo não pode mais ser alterado." });
      return row;
    }
    const [row] = await db.insert(s.newsletterCampaigns).values({ creationKey: input.creationKey, subject: input.subject, message: input.message }).onConflictDoNothing().returning();
    if (!row) throw new ORPCError("CONFLICT", { message: "Rascunho já salvo. Atualize a página." });
    return row;
  }),
  prepare: base.input(campaignInput.extend({ expectedCount: z.number().int().positive(), expectedSubject: z.string(), expectedMessage: z.string() })).handler(async ({ input }) => {
    assertOps(input.token);
    const c = await campaignById(input.id);
    if (c.subject !== input.expectedSubject || c.message !== input.expectedMessage) throw new ORPCError("CONFLICT", { message: "Conteúdo da campanha mudou. Reabra e confira antes de enviar." });
    return prepareCampaign(input.id, input.expectedCount);
  }),
  sendChunk: base.input(campaignInput).handler(async ({ input }) => { assertOps(input.token); return sendCampaignChunk(input.id); }),
  retryFailed: base.input(campaignInput).handler(async ({ input }) => {
    assertOps(input.token);
    const c = await campaignById(input.id);
    if (c.sendLock || !["active", "completed"].includes(c.status)) throw new ORPCError("CONFLICT", { message: "Campanha não está disponível para retentativa." });
    const lock = randomUUID();
    const won = await db.update(s.newsletterCampaigns).set({ sendLock: lock, lockAt: new Date() })
      .where(and(eq(s.newsletterCampaigns.id, input.id), isNull(s.newsletterCampaigns.sendLock))).returning();
    if (!won.length) throw new ORPCError("CONFLICT", { message: "Há um lote em andamento." });
    // Apenas recusas explícitas do provedor. 'uncertain' nunca entra nesta atualização.
    try { await db.batch([
      db.update(s.newsletterRecipients).set({ status: "queued", error: null }).where(and(eq(s.newsletterRecipients.campaignId, input.id), eq(s.newsletterRecipients.status, "failed"))),
      db.update(s.newsletterCampaigns).set({ status: "active", completedAt: null }).where(eq(s.newsletterCampaigns.id, input.id)),
    ]); } finally {
      await db.update(s.newsletterCampaigns).set({ sendLock: null, lockAt: null }).where(and(eq(s.newsletterCampaigns.id, input.id), eq(s.newsletterCampaigns.sendLock, lock)));
    }
    return { counts: await campaignStats(input.id) };
  }),
  recover: base.input(campaignInput).handler(async ({ input }) => { assertOps(input.token); return recoverCampaign(input.id); }),
  campaignRecipients: base.input(campaignInput.extend({ page: z.number().int().min(1).default(1) })).handler(async ({ input }) => {
    assertOps(input.token);
    const where = eq(s.newsletterRecipients.campaignId, input.id);
    const [n] = await db.select({ total: count() }).from(s.newsletterRecipients).where(where);
    const rows = await db.select().from(s.newsletterRecipients).where(where).orderBy(desc(s.newsletterRecipients.id)).limit(50).offset((input.page - 1) * 50);
    return { rows, total: n.total, pages: Math.max(1, Math.ceil(n.total / 50)) };
  }),
  subscription: base.input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) })).handler(async ({ input }) => {
    const [r] = await db.select({ status: s.newsletterSubscribers.status }).from(s.newsletterSubscribers).where(eq(s.newsletterSubscribers.unsubscribeToken, input.token)).limit(1);
    if (!r) throw new ORPCError("NOT_FOUND", { message: "Link de cancelamento inválido." });
    return { subscribed: r.status === "subscribed" };
  }),
  unsubscribe: base.input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) })).handler(({ input }) => unsubscribeNewsletter(input.token)),
};