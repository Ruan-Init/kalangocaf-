import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import * as s from "../database/schema";
import { orderConfirmationMessages } from "./email";
import { sendMail } from "./mail-transport";

async function templates(order: s.Order) {
  const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id));
  return orderConfirmationMessages({
    reference: order.reference, customerName: order.customerName, email: order.email, phone: order.phone,
    items: items.map((i) => ({ name: i.name, grind: i.grind, quantity: i.quantity, unitCents: i.unitCents })),
    subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, totalCents: order.totalCents, shippingLabel: order.shippingMethod,
    address: { street: order.street, number: order.number, complement: order.complement, district: order.district, city: order.city, state: order.state, zip: order.zip },
  });
}

/** Diário é gravado antes da rede. CAS + idempotência do provedor evitam duplo aviso. */
export async function deliverOrderEmails(order: s.Order, retry = false) {
  if (order.isTest || !order.paidAt) return;
  const messages = await templates(order);
  for (const audience of ["customer", "internal"] as const) {
    const key = `order-confirmation/${order.reference}/${audience}`;
    const [existing] = await db.select().from(s.orderEmails).where(eq(s.orderEmails.key, key)).limit(1);
    if (!existing || existing.status === "accepted") continue;
    let allowed = ["pending"];
    if (retry) {
      // Resultado incerto/in-flight exige conferência no provedor, nunca reenvio cego.
      allowed = ["pending", "failed"];
    }
    const won = await db.update(s.orderEmails).set({ status: "sending", attemptedAt: new Date(), error: null })
      .where(and(eq(s.orderEmails.key, key), inArray(s.orderEmails.status, allowed))).returning();
    if (!won.length) continue;
    const result = await sendMail(messages[audience], key);
    await db.update(s.orderEmails).set(result.sent
      ? { status: "accepted", providerId: result.ids[0], acceptedAt: new Date(), error: null }
      : { status: result.uncertain ? "uncertain" : "failed", error: result.error }).where(eq(s.orderEmails.key, key));
  }
}

export async function queueOrderEmails(order: s.Order) {
  if (order.isTest || !order.paidAt) return;
  await db.insert(s.orderEmails).values(["customer", "internal"].map((audience) => ({ key: `order-confirmation/${order.reference}/${audience}`, orderId: order.id, audience }))).onConflictDoNothing();
  // Pagamento não espera pelo provedor de e-mail. O diário permite recuperar após restart.
  void deliverOrderEmails(order).catch(() => console.error("[email] confirmação pendente; consulte o diário na Gestão"));
}

export async function retryOrderEmails(order: s.Order) {
  if (order.isTest || !order.paidAt) throw new ORPCError("BAD_REQUEST", { message: "Confirmação só pode ser enviada para pedido real com pagamento aprovado." });
  await db.insert(s.orderEmails).values(["customer", "internal"].map((audience) => ({ key: `order-confirmation/${order.reference}/${audience}`, orderId: order.id, audience }))).onConflictDoNothing();
  await deliverOrderEmails(order, true);
  return db.select({ audience: s.orderEmails.audience, status: s.orderEmails.status, error: s.orderEmails.error }).from(s.orderEmails).where(eq(s.orderEmails.orderId, order.id));
}