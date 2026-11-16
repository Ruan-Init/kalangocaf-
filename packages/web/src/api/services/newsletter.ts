import { randomBytes, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { STORE } from "../config/store";
import { escapeEmailHtml as esc, mailConfiguration, sendMailBatch, type MailMessage } from "./mail-transport";

export async function subscribeNewsletter(name: string, email: string) {
  const normalized = email.trim().toLowerCase();
  await db.insert(s.newsletterSubscribers).values({ email: normalized, name: name.trim(), unsubscribeToken: randomBytes(32).toString("hex") })
    .onConflictDoUpdate({ target: s.newsletterSubscribers.email,
      set: { name: name.trim(), status: "subscribed", subscribedAt: new Date(), unsubscribedAt: null } });
}

export async function unsubscribeNewsletter(token: string) {
  const rows = await db.update(s.newsletterSubscribers).set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(and(eq(s.newsletterSubscribers.unsubscribeToken, token), eq(s.newsletterSubscribers.status, "subscribed"))).returning({ id: s.newsletterSubscribers.id });
  const [subscriber] = await db.select({ id: s.newsletterSubscribers.id }).from(s.newsletterSubscribers)
    .where(eq(s.newsletterSubscribers.unsubscribeToken, token)).limit(1);
  if (!subscriber) throw new ORPCError("NOT_FOUND", { message: "Link de cancelamento inválido." });
  // Destinatário que ainda não foi enviado sai da fila imediatamente.
  await db.update(s.newsletterRecipients).set({ status: "skipped", error: "Inscrição cancelada" })
    .where(and(eq(s.newsletterRecipients.subscriberId, subscriber.id), eq(s.newsletterRecipients.status, "queued")));
  return { ok: true, changed: rows.length > 0 };
}

export type CampaignCounts = { queued: number; processing: number; accepted: number; failed: number; uncertain: number; skipped: number; total: number };
export async function campaignStats(id: number): Promise<CampaignCounts> {
  const grouped = await db.select({ status: s.newsletterRecipients.status, total: count() })
    .from(s.newsletterRecipients).where(eq(s.newsletterRecipients.campaignId, id)).groupBy(s.newsletterRecipients.status);
  const counts: Record<string, number> = { queued: 0, processing: 0, accepted: 0, failed: 0, uncertain: 0, skipped: 0 };
  for (const row of grouped) counts[row.status] = row.total;
  return { queued: counts.queued, processing: counts.processing, accepted: counts.accepted, failed: counts.failed,
    uncertain: counts.uncertain, skipped: counts.skipped, total: grouped.reduce((sum, row) => sum + row.total, 0) };
}

export async function campaignById(id: number) {
  const [campaign] = await db.select().from(s.newsletterCampaigns).where(eq(s.newsletterCampaigns.id, id)).limit(1);
  if (!campaign) throw new ORPCError("NOT_FOUND", { message: "Campanha não encontrada." });
  return campaign;
}

export function newsletterMessage(subject: string, message: string, unsubscribeToken: string): MailMessage {
  const site = new URL(process.env.WEBSITE_URL ?? "https://kalangocafe.com.br");
  if (site.protocol !== "https:") throw new Error("WEBSITE_URL precisa ser HTTPS para newsletter");
  const cancel = `${site.origin}/newsletter/cancelar?t=${unsubscribeToken}`;
  const oneClick = `${site.origin}/api/webhooks/newsletter/unsubscribe?token=${unsubscribeToken}`;
  const paragraphs = message.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 20px;white-space:pre-wrap;">${esc(p)}</p>`).join("");
  return {
    to: "", subject,
    html: `<html lang="pt-BR"><body style="margin:0;background:#0B0907;padding:32px 16px;"><div style="max-width:560px;margin:auto;background:#F3EEE4;color:#231F1B;padding:32px;font:16px/1.7 Arial,sans-serif;"><p style="font-size:11px;letter-spacing:.2em;color:#5F7A43;">KALANGO CAFÉS ESPECIAIS</p><h1 style="font:700 30px/1.15 Georgia,serif;">${esc(subject)}</h1>${paragraphs}<hr style="border:0;border-top:1px solid #DDD4C6;"><p style="font-size:12px;color:#6B635A;">Você recebe esta mensagem porque se inscreveu na newsletter da Kalango.<br>${esc(STORE.address.street)} · ${esc(STORE.address.district)}, ${esc(STORE.address.city)}/${esc(STORE.address.state)}<br><a href="${cancel}" style="color:#5F7A43;">Cancelar inscrição</a> · <a href="mailto:${STORE.notificationEmail}">Fale com a Kalango</a></p></div></body></html>`,
    text: `${subject}\n\n${message}\n\nVocê se inscreveu na newsletter da Kalango.\nCancelar inscrição: ${cancel}\n${STORE.address.street}, ${STORE.address.city}/${STORE.address.state}`,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** Congela a audiência somente ao confirmar envio, nunca ao salvar rascunho. */
export async function prepareCampaign(id: number, expectedCount: number) {
  if (!mailConfiguration().ready) throw new ORPCError("BAD_REQUEST", { message: "Configure o serviço de e-mail antes de enviar. O rascunho está salvo." });
  const campaign = await campaignById(id);
  if (campaign.status !== "draft") return { campaign, counts: await campaignStats(id) };
  const subscribers = await db.select().from(s.newsletterSubscribers).where(eq(s.newsletterSubscribers.status, "subscribed")).orderBy(asc(s.newsletterSubscribers.id)).limit(5001);
  if (subscribers.length > 5000) throw new ORPCError("BAD_REQUEST", { message: "Limite desta campanha: 5.000 inscritos." });
  if (!subscribers.length) throw new ORPCError("BAD_REQUEST", { message: "Nenhum inscrito ativo para receber esta campanha." });
  if (subscribers.length !== expectedCount) throw new ORPCError("CONFLICT", { message: "A lista de inscritos mudou. Atualize e confirme o novo total." });
  const won = await db.update(s.newsletterCampaigns).set({ status: "preparing", startedAt: new Date() })
    .where(and(eq(s.newsletterCampaigns.id, id), eq(s.newsletterCampaigns.status, "draft"))).returning();
  if (!won.length) throw new ORPCError("CONFLICT", { message: "Esta campanha já está sendo preparada. Atualize a página." });
  try {
    // Uma transação: audiência completa e status juntos.
    await db.batch([
      db.update(s.newsletterCampaigns).set({ status: "active" }).where(eq(s.newsletterCampaigns.id, id)),
      // Blocos de 500 linhas: respeita o limite de parâmetros do SQLite na mesma transação.
      ...Array.from({ length: Math.ceil(subscribers.length / 500) }, (_, i) =>
        db.insert(s.newsletterRecipients).values(subscribers.slice(i * 500, i * 500 + 500).map((r) => ({ campaignId: id, subscriberId: r.id, email: r.email }))).onConflictDoNothing()),
    ]);
  } catch (error) {
    await db.update(s.newsletterCampaigns).set({ status: "draft", startedAt: null }).where(eq(s.newsletterCampaigns.id, id));
    throw error;
  }
  return { campaign: await campaignById(id), counts: await campaignStats(id) };
}

/** Retoma só destinatários nunca enviados; não repete lotes de resultado incerto. */
export async function recoverCampaign(id: number) {
  const c = await campaignById(id);
  if (c.status === "preparing" && c.startedAt && Date.now() - c.startedAt.getTime() > 90_000) {
    const counts = await campaignStats(id);
    if (counts.total === 0) {
      await db.update(s.newsletterCampaigns).set({ status: "draft", startedAt: null }).where(and(eq(s.newsletterCampaigns.id, id), eq(s.newsletterCampaigns.status, "preparing")));
    }
  }
  if (c.sendLock) {
    if (!c.lockAt || Date.now() - c.lockAt.getTime() < 90_000) throw new ORPCError("CONFLICT", { message: "Há um lote em andamento. Aguarde a resposta antes de retomar." });
    await db.batch([
      db.update(s.newsletterRecipients).set({ status: "uncertain", error: "Envio interrompido. Conferir no Resend; não reenviar automaticamente." })
        .where(and(eq(s.newsletterRecipients.campaignId, id), eq(s.newsletterRecipients.status, "processing"))),
      db.update(s.newsletterBatches).set({ status: "uncertain", error: "Envio interrompido" })
        .where(and(eq(s.newsletterBatches.campaignId, id), eq(s.newsletterBatches.status, "processing"))),
      db.update(s.newsletterCampaigns).set({ sendLock: null, lockAt: null }).where(and(eq(s.newsletterCampaigns.id, id), eq(s.newsletterCampaigns.sendLock, c.sendLock))),
    ]);
  }
  return { campaign: await campaignById(id), counts: await campaignStats(id) };
}

/** Lote curto: evita requisição longa/gateway timeout ao enviar campanhas. */
export async function sendCampaignChunk(id: number) {
  if (!mailConfiguration().ready) throw new ORPCError("BAD_REQUEST", { message: "Serviço de e-mail não configurado. Nenhuma mensagem enviada." });
  const c = await campaignById(id);
  if (c.status !== "active") return { counts: await campaignStats(id), error: null };
  const lock = randomUUID();
  const won = await db.update(s.newsletterCampaigns).set({ sendLock: lock, lockAt: new Date() })
    .where(and(eq(s.newsletterCampaigns.id, id), eq(s.newsletterCampaigns.status, "active"), isNull(s.newsletterCampaigns.sendLock))).returning();
  if (!won.length) throw new ORPCError("CONFLICT", { message: "Já existe um envio desta campanha em andamento." });
  let error: string | null = null;
  try {
    const rows = await db.select({ recipient: s.newsletterRecipients, subscriber: s.newsletterSubscribers })
      .from(s.newsletterRecipients).innerJoin(s.newsletterSubscribers, eq(s.newsletterRecipients.subscriberId, s.newsletterSubscribers.id))
      .where(and(eq(s.newsletterRecipients.campaignId, id), eq(s.newsletterRecipients.status, "queued")))
      .orderBy(asc(s.newsletterRecipients.id)).limit(50);
    const active = rows.filter((r) => r.subscriber.status === "subscribed");
    const skip = rows.filter((r) => r.subscriber.status !== "subscribed").map((r) => r.recipient.id);
    if (skip.length) await db.update(s.newsletterRecipients).set({ status: "skipped", error: "Inscrição cancelada" }).where(inArray(s.newsletterRecipients.id, skip));
    if (active.length) {
      let ids = active.map((r) => r.recipient.id);
      const [, claimed] = await db.batch([
        db.insert(s.newsletterBatches).values({ id: lock, campaignId: id, recipientIds: ids }),
        db.update(s.newsletterRecipients).set({ status: "processing" }).where(and(inArray(s.newsletterRecipients.id, ids), eq(s.newsletterRecipients.status, "queued"))).returning({ id: s.newsletterRecipients.id }),
      ]);
      ids = claimed.map((r) => r.id);
      await db.update(s.newsletterBatches).set({ recipientIds: ids }).where(eq(s.newsletterBatches.id, lock));
      const messages = ids.map((id) => {
        const r = active.find((r) => r.recipient.id === id)!;
        return { ...newsletterMessage(c.subject, c.message, r.subscriber.unsubscribeToken), to: r.recipient.email };
      });
      const result = messages.length ? await sendMailBatch(messages, `newsletter/${id}/${lock}`) : null;
      if (!result) {
        await db.update(s.newsletterBatches).set({ status: "skipped" }).where(eq(s.newsletterBatches.id, lock));
      } else if (result.sent) {
        await db.batch([
          db.update(s.newsletterBatches).set({ status: "accepted" }).where(eq(s.newsletterBatches.id, lock)),
          ...ids.map((recipientId, i) => db.update(s.newsletterRecipients).set({ status: "accepted", providerId: result.ids[i], acceptedAt: new Date(), error: null }).where(eq(s.newsletterRecipients.id, recipientId))),
        ]);
      } else {
        error = result.error;
        const status = result.uncertain ? "uncertain" : "failed";
        await db.batch([
          db.update(s.newsletterRecipients).set({ status, error }).where(inArray(s.newsletterRecipients.id, ids)),
          db.update(s.newsletterBatches).set({ status, error }).where(eq(s.newsletterBatches.id, lock)),
        ]);
      }
    }
  } catch {
    error = "Envio interrompido. Confira o histórico e o Resend; destinatários incertos não serão reenviados.";
    await db.batch([
      db.update(s.newsletterRecipients).set({ status: "uncertain", error }).where(and(eq(s.newsletterRecipients.campaignId, id), eq(s.newsletterRecipients.status, "processing"))),
      db.update(s.newsletterBatches).set({ status: "uncertain", error }).where(eq(s.newsletterBatches.id, lock)),
    ]);
  } finally {
    await db.update(s.newsletterCampaigns).set({ sendLock: null, lockAt: null }).where(and(eq(s.newsletterCampaigns.id, id), eq(s.newsletterCampaigns.sendLock, lock)));
  }
  const counts = await campaignStats(id);
  if (!counts.queued && !counts.processing) await db.update(s.newsletterCampaigns).set({ status: "completed", completedAt: new Date() }).where(eq(s.newsletterCampaigns.id, id));
  return { counts, error };
}