import { beforeEach, expect, test } from "bun:test";
import { call } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { otherHosts } from "./mp-mock";
import { db } from "../src/api/database";
import * as s from "../src/api/database/schema";
import { newsletter } from "../src/api/routes/newsletter";
import { leads } from "../src/api/routes/leads";
import { admin } from "../src/api/routes/admin";
import { orders } from "../src/api/routes/orders";
import app from "../src/api/index";
import { newsletterLegacySql } from "../src/api/database/newsletter-schema";
import { newsletterMessage, subscribeNewsletter } from "../src/api/services/newsletter";
import { deriveAccessToken, deriveEmailAccessToken, sha256 } from "../src/api/services/order-access";
import { retryOrderEmails } from "../src/api/services/order-email";

const ctx = { context: { headers: new Headers() } };
const token = "ops-newsletter-test-only";
const sent: { payload: any; key: string; path: string }[] = [];
let failure: "none" | "403" | "network" | "empty" = "none";
let onSend: (() => void) | null = null;
let delay: Promise<void> | null = null;
otherHosts.set("api.resend.com", async (url, init) => {
  sent.push({ payload: JSON.parse(String(init?.body)), key: new Headers(init?.headers).get("Idempotency-Key")!, path: url.pathname });
  onSend?.();
  if (delay) await delay;
  if (failure === "network") throw new Error("network-fake");
  if (failure === "403") return Response.json({ message: "SECRET-SHOULD-NOT-APPEAR" }, { status: 403 });
  if (failure === "empty") return Response.json({ data: [] });
  const payload = sent.at(-1)!.payload;
  return Response.json(Array.isArray(payload) ? { data: payload.map((_: any, i: number) => ({ id: `fake-${sent.length}-${i}` })) } : { id: `single-${sent.length}` });
});

beforeEach(async () => {
  await db.run(sql.raw("DELETE FROM newsletter_batches"));
  await db.run(sql.raw("DELETE FROM newsletter_recipients"));
  await db.run(sql.raw("DELETE FROM newsletter_campaigns"));
  await db.run(sql.raw("DELETE FROM newsletter_subscribers"));
  await db.run(sql.raw("DELETE FROM leads"));
  await db.run(sql.raw("DELETE FROM order_emails"));
  await db.run(sql.raw("DELETE FROM order_items"));
  await db.run(sql.raw("DELETE FROM orders"));
  process.env.OPS_TOKEN = token;
  process.env.RESEND_API_KEY = "re_fake_key_never_real";
  process.env.EMAIL_FROM = "Kalango <mail@example.test>";
  sent.length = 0; failure = "none"; onSend = null; delay = null;
});

async function draft() {
  return call(newsletter.saveCampaign, { token, creationKey: crypto.randomUUID(), subject: "Microlote novo", message: "Uma novidade fresca da torrefação.\n\nConfira os cafés." }, ctx);
}
async function prepare(c: Awaited<ReturnType<typeof draft>>, expectedCount: number) {
  return call(newsletter.prepare, { token, id: c.id, expectedCount, expectedSubject: c.subject, expectedMessage: c.message }, ctx);
}
async function subscribers(n: number) {
  await db.insert(s.newsletterSubscribers).values(Array.from({ length: n }, (_, i) => ({ name: `Pessoa ${i}`, email: `fake${i}@example.test`, unsubscribeToken: i.toString(16).padStart(64, "0") })));
}

test("gestão exige senha em toda ação protegida e nunca exporta token de cancelamento", async () => {
  await subscribers(1);
  await expect(call(newsletter.summary, { token: "wrong" }, ctx)).rejects.toThrow("Senha inválida");
  await expect(call(newsletter.exportSubscribers, { token: "wrong", search: "", status: "all" }, ctx)).rejects.toThrow("Senha inválida");
  const r = await call(newsletter.subscribers, { token, search: "", status: "all", page: 1 }, ctx);
  expect(r.rows).toHaveLength(1);
  expect(JSON.stringify(r)).not.toContain("unsubscribeToken");
  expect(sent).toHaveLength(0);
});

test("só opt-in newsletter vira inscrito, deduplicado por e-mail", async () => {
  await call(leads.create, { kind: "contato", name: "Comprador", email: "a@example.test" }, ctx);
  expect((await call(newsletter.summary, { token }, ctx)).total).toBe(0);
  await subscribeNewsletter("Pessoa", "  SAME@example.test ");
  await call(leads.create, { kind: "newsletter", name: "Pessoa nova", email: "same@example.test" }, ctx);
  expect((await call(newsletter.summary, { token }, ctx)).active).toBe(1);
});

test("migração legado é idempotente, não importa contato nem reativa cancelado", async () => {
  await db.insert(s.leads).values([{ kind: "newsletter", name: "N", email: "SAME@example.test" }, { kind: "newsletter", name: "N", email: "same@example.test" }, { kind: "contato", name: "C", email: "other@example.test" }]);
  await db.run(sql.raw(newsletterLegacySql));
  const [r] = await db.select().from(s.newsletterSubscribers);
  await call(newsletter.unsubscribe, { token: r.unsubscribeToken }, ctx);
  await db.run(sql.raw(newsletterLegacySql));
  const summary = await call(newsletter.summary, { token }, ctx);
  expect(summary.total).toBe(1); expect(summary.active).toBe(0); expect(summary.unsubscribed).toBe(1);
});

test("CSV filtrado, paginado e protegido contra fórmula", async () => {
  await subscribers(52);
  await db.update(s.newsletterSubscribers).set({ name: '=HYPERLINK("bad")' }).where(eq(s.newsletterSubscribers.email, "fake0@example.test"));
  const p1 = await call(newsletter.subscribers, { token, search: "", status: "all", page: 1 }, ctx);
  const p2 = await call(newsletter.subscribers, { token, search: "", status: "all", page: 2 }, ctx);
  expect(p1.rows).toHaveLength(50); expect(p2.rows).toHaveLength(2); expect(p1.pages).toBe(2);
  const csv = await call(newsletter.exportSubscribers, { token, search: "fake0@", status: "all" }, ctx);
  expect(csv.count).toBe(1); expect(csv.csv).toContain("'=HYPERLINK"); expect(csv.csv).not.toContain("unsubscribe_token");
  expect((await call(newsletter.subscribers, { token, search: "%", status: "all", page: 1 }, ctx)).total).toBe(0);
});

test("rascunho não envia e fica bloqueado sem serviço", async () => {
  await subscribers(1);
  delete process.env.RESEND_API_KEY;
  const c = await draft();
  expect(c.status).toBe("draft");
  expect((await call(newsletter.summary, { token }, ctx)).configuration.ready).toBe(false);
  await expect(prepare(c, 1)).rejects.toThrow("Configure o serviço");
  expect(sent).toHaveLength(0);
});

test("confirmação detecta audiência/conteúdo alterados e impede edição depois de iniciar", async () => {
  await subscribers(1); const c = await draft();
  await expect(prepare(c, 2)).rejects.toThrow("lista de inscritos mudou");
  await expect(call(newsletter.prepare, { token, id: c.id, expectedCount: 1, expectedSubject: "outro", expectedMessage: c.message }, ctx)).rejects.toThrow("Conteúdo");
  await prepare(c, 1); await prepare(c, 1);
  expect((await db.select().from(s.newsletterRecipients))).toHaveLength(1);
  await expect(call(newsletter.saveCampaign, { token, id: c.id, creationKey: c.creationKey, subject: "outro", message: c.message }, ctx)).rejects.toThrow("já iniciada");
});

test("lotes de 50 mantêm privacidade e não repetem destinatários aceitos", async () => {
  await subscribers(75); const c = await draft(); await prepare(c, 75);
  const a = await call(newsletter.sendChunk, { token, id: c.id }, ctx);
  const b = await call(newsletter.sendChunk, { token, id: c.id }, ctx);
  const again = await call(newsletter.sendChunk, { token, id: c.id }, ctx);
  expect(a.counts.accepted).toBe(50); expect(a.counts.queued).toBe(25); expect(b.counts.accepted).toBe(75);
  expect(again.counts.accepted).toBe(75); expect(sent).toHaveLength(2);
  for (const batch of sent) for (const email of batch.payload) {
    expect(email.to).toHaveLength(1); expect(email.from).toBe("Kalango <mail@example.test>");
    expect(email.html).toContain("Cancelar inscrição"); expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  }
});

test("trava impede dois operadores disparando o mesmo lote", async () => {
  await subscribers(2); const c = await draft(); await prepare(c, 2);
  let signal!: () => void; const entered = new Promise<void>((r) => { signal = r; });
  let release!: () => void; delay = new Promise<void>((r) => { release = r; }); onSend = signal;
  const first = call(newsletter.sendChunk, { token, id: c.id }, ctx); await entered;
  await expect(call(newsletter.sendChunk, { token, id: c.id }, ctx)).rejects.toThrow("em andamento");
  release(); await first; expect(sent).toHaveLength(1);
});

test("cancelamento sai da fila, GET/read não cancela e one-click é idempotente", async () => {
  await subscribers(2); const c = await draft(); await prepare(c, 2);
  const [r] = await db.select().from(s.newsletterSubscribers);
  expect((await call(newsletter.subscription, { token: r.unsubscribeToken }, ctx)).subscribed).toBe(true);
  const url = `/api/webhooks/newsletter/unsubscribe?token=${r.unsubscribeToken}`;
  expect((await app.request(url)).status).toBe(404);
  expect((await call(newsletter.subscription, { token: r.unsubscribeToken }, ctx)).subscribed).toBe(true);
  expect((await app.request(url, { method: "POST", body: "wrong" })).status).toBe(400);
  expect((await app.request(url, { method: "POST", body: "List-Unsubscribe=One-Click" })).status).toBe(200);
  expect((await app.request(url, { method: "POST", body: "List-Unsubscribe=One-Click" })).status).toBe(200);
  const result = await call(newsletter.sendChunk, { token, id: c.id }, ctx);
  expect(result.counts.skipped).toBe(1); expect(result.counts.accepted).toBe(1); expect(sent[0].payload).toHaveLength(1);
});

test("rede/resposta incompleta ficam incertas e não são repetidas; recusas explícitas podem ser retomadas", async () => {
  await subscribers(3); const c = await draft(); await prepare(c, 3);
  failure = "network"; const unknown = await call(newsletter.sendChunk, { token, id: c.id }, ctx);
  expect(unknown.counts.uncertain).toBe(3);
  failure = "none"; await call(newsletter.retryFailed, { token, id: c.id }, ctx); await call(newsletter.sendChunk, { token, id: c.id }, ctx);
  expect(sent).toHaveLength(1);
  const next = await draft(); await prepare(next, 3); failure = "403";
  const failed = await call(newsletter.sendChunk, { token, id: next.id }, ctx);
  expect(failed.counts.failed).toBe(3); expect(failed.error).not.toContain("SECRET-SHOULD-NOT-APPEAR");
  await call(newsletter.retryFailed, { token, id: next.id }, ctx); failure = "none";
  expect((await call(newsletter.sendChunk, { token, id: next.id }, ctx)).counts.accepted).toBe(3);
});

test("template escapa HTML e mantém rodapé de opt-out", () => {
  const msg = newsletterMessage('<script>alert(1)</script>', '<img src=x onerror=alert(1)>\n\nOlá!', "a".repeat(64));
  expect(msg.html).not.toContain("<script>"); expect(msg.html).not.toContain("<img src=x"); expect(msg.html).toContain("&lt;img"); expect(msg.text).toContain("Cancelar inscrição:");
});

async function paidOrder(isTest = false) {
  const reference = `KLG-TESTMAIL-${crypto.randomUUID().slice(0, 8)}`;
  const [o] = await db.insert(s.orders).values({ reference, status: "paid", isTest, paidAt: new Date(), customerName: "Fake", email: "fake@example.test", phone: "61999999999", document: "12345678909", zip: "71503503", street: "Rua", number: "1", district: "Bairro", city: "Brasília", state: "DF", shippingMethod: "PAC", subtotalCents: 9500, totalCents: 9500, accessTokenHash: sha256(deriveAccessToken(reference, "test-key")) }).returning();
  return o;
}

test("confirmação registra falha sem chave, aceita retry e link do e-mail abre só o pedido certo", async () => {
  const o = await paidOrder(); delete process.env.RESEND_API_KEY;
  const missing = await retryOrderEmails(o); expect(missing.every((r) => r.status === "failed")).toBe(true); expect(sent).toHaveLength(0);
  process.env.RESEND_API_KEY = "fake-test-only";
  const r = await call(admin.retryConfirmation, { token, reference: o.reference }, ctx);
  expect(r.emails.every((r) => r.status === "accepted")).toBe(true); expect(sent).toHaveLength(2);
  expect(sent[0].payload.html).toContain("?t=");
  const access = deriveEmailAccessToken(o.reference);
  expect((await call(orders.get, { reference: o.reference, token: access }, ctx)).paid).toBe(true);
  await expect(call(orders.get, { reference: o.reference, token: deriveEmailAccessToken("OTHER-ORDER") }, ctx)).rejects.toThrow("não encontrado");
  await retryOrderEmails(o); expect(sent).toHaveLength(2);
});

test("confirmação não envia para teste ou não pago e não repete resposta incerta", async () => {
  const t = await paidOrder(true); await expect(retryOrderEmails(t)).rejects.toThrow("pedido real");
  const o = await paidOrder(); failure = "network"; await retryOrderEmails(o);
  expect(sent).toHaveLength(2); failure = "none"; await retryOrderEmails(o); expect(sent).toHaveLength(2);
  await db.update(s.orders).set({ paidAt: null }).where(eq(s.orders.id, o.id));
  await expect(call(admin.retryConfirmation, { token, reference: o.reference }, ctx)).rejects.toThrow("pagamento aprovado");
});