import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { sendClubPaymentOperationsNotice } from "./email";
import { sendClubWelcomeEmail } from "./newsletter";
import {
  mpEnv,
  orderEnvironmentMatches,
  type MpPayment,
  type MpPreapproval,
} from "./mercadopago";

const KNOWN_PAYMENT_STATUSES = new Set([
  "pending",
  "in_process",
  "authorized",
  "approved",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
  "in_mediation",
]);
const AFTER_PAID = new Set(["refunded", "charged_back", "cancelled", "in_mediation"]);
const PREAPPROVAL_STATUSES = new Set(["authorized", "pending", "paused", "cancelled", "rejected"]);

async function findSubscriptionByReference(reference: string) {
  const [subscription] = await db
    .select()
    .from(schema.clubSubscriptions)
    .where(eq(schema.clubSubscriptions.reference, reference))
    .limit(1);
  return subscription ?? null;
}

async function notifyPaid(
  subscription: schema.ClubSubscription,
  paymentId: string,
  sendWelcome: boolean,
) {
  const planNames: Record<string, string> = {
    descoberta: "Descoberta",
    duo: "Duo",
    obsessao: "Obsessão",
  };
  try {
    if (sendWelcome) {
      const welcome = await sendClubWelcomeEmail({
        reference: subscription.reference,
        customerName: subscription.customerName,
        email: subscription.email,
        planName: planNames[subscription.plan] ?? subscription.plan,
        amountCents: subscription.amountCents,
      });
      if (!welcome.sent) {
        console.error(`[club] boas-vindas de ${subscription.reference} não foram aceitas: ${welcome.error}`);
      }
    }
    const sent = await sendClubPaymentOperationsNotice({
      reference: subscription.reference,
      paymentId,
      customerName: subscription.customerName,
      email: subscription.email,
      phone: subscription.phone,
      planName: planNames[subscription.plan] ?? subscription.plan,
      amountCents: subscription.amountCents,
      paymentMethod: subscription.paymentMethod === "card" ? "card" : "pix",
      address: {
        street: subscription.street,
        number: subscription.number,
        complement: subscription.complement,
        district: subscription.district,
        city: subscription.city,
        state: subscription.state,
        zip: subscription.zip,
      },
    });
    if (!sent.sent) {
      console.error(`[club] aviso interno do pagamento ${paymentId} não foi aceito: ${sent.error}`);
    }
  } catch (error) {
    console.error(
      `[club] falha ao enviar confirmação do pagamento ${paymentId}:`,
      error instanceof Error ? error.message : "erro inesperado",
    );
  }
}

export async function applyClubPayment(payment: MpPayment, sellerId: string) {
  const reference = payment.external_reference ?? "";
  const subscription = reference ? await findSubscriptionByReference(reference) : null;
  if (!subscription) {
    return { outcome: "ignored_unknown_subscription", reference: reference || null };
  }

  if (payment.collector_id === undefined || String(payment.collector_id) !== sellerId) {
    return { outcome: "ignored_mismatch_seller", reference };
  }
  if (
    !orderEnvironmentMatches(subscription) ||
    (mpEnv() === "test" && payment.live_mode === true) ||
    (mpEnv() === "production" && payment.live_mode !== true)
  ) {
    return { outcome: "ignored_mismatch_environment", reference };
  }
  if (payment.currency_id !== "BRL") return { outcome: "ignored_mismatch_currency", reference };
  if (Math.round(payment.transaction_amount * 100) !== subscription.amountCents) {
    return { outcome: "ignored_mismatch_amount", reference };
  }
  if (!KNOWN_PAYMENT_STATUSES.has(payment.status)) {
    return { outcome: "ignored_unknown_status", reference };
  }

  const paymentId = String(payment.id);
  const detail = payment.status_detail ?? null;
  let [knownPayment] = await db
    .select()
    .from(schema.clubSubscriptionPayments)
    .where(eq(schema.clubSubscriptionPayments.paymentId, paymentId))
    .limit(1);
  const paidAt = payment.date_approved ? new Date(payment.date_approved) : null;
  let insertedPayment = false;

  if (!knownPayment) {
    try {
      [knownPayment] = await db
        .insert(schema.clubSubscriptionPayments)
        .values({
          subscriptionId: subscription.id,
          paymentId,
          status: payment.status,
          statusDetail: detail,
          amountCents: subscription.amountCents,
          paidAt: payment.status === "approved" ? paidAt ?? new Date() : null,
        })
        .returning();
      insertedPayment = true;
    } catch (error) {
      const [racedPayment] = await db
        .select()
        .from(schema.clubSubscriptionPayments)
        .where(eq(schema.clubSubscriptionPayments.paymentId, paymentId))
        .limit(1);
      if (!racedPayment) throw error;
      knownPayment = racedPayment;
    }
  }

  if (!insertedPayment && knownPayment.status === "approved" && !AFTER_PAID.has(payment.status)) {
    return { outcome: "duplicate", reference };
  }
  if (!insertedPayment && knownPayment.status === payment.status && knownPayment.statusDetail === detail) {
    return { outcome: "duplicate", reference };
  }

  await db
    .update(schema.clubSubscriptionPayments)
    .set({
      status: payment.status,
      statusDetail: detail,
      paidAt: payment.status === "approved" ? paidAt ?? new Date() : knownPayment.paidAt,
    })
    .where(eq(schema.clubSubscriptionPayments.id, knownPayment.id));

  if (payment.status === "approved") {
    const status = ["cancelled", "paused", "rejected"].includes(subscription.status)
      ? subscription.status
      : "active";
    await db
      .update(schema.clubSubscriptions)
      .set({
        status,
        paymentStatus: "approved",
        paymentStatusDetail: detail,
        mpPaymentId: paymentId,
        paidAt: paidAt ?? new Date(),
      })
      .where(eq(schema.clubSubscriptions.id, subscription.id));
    await notifyPaid(
      subscription,
      paymentId,
      !subscription.paidAt && status === "active",
    );
    return { outcome: "paid", reference };
  }

  await db
    .update(schema.clubSubscriptions)
    .set({ paymentStatus: payment.status, paymentStatusDetail: detail })
    .where(eq(schema.clubSubscriptions.id, subscription.id));
  return { outcome: "processed", reference };
}

export async function applyClubPreapproval(
  preapproval: MpPreapproval,
  sellerId: string,
) {
  const [subscription] = preapproval.id
    ? await db
        .select()
        .from(schema.clubSubscriptions)
        .where(eq(schema.clubSubscriptions.mpPreapprovalId, preapproval.id))
        .limit(1)
    : [];
  if (!subscription) {
    return {
      outcome: "ignored_unknown_subscription",
      reference: String(preapproval.external_reference ?? "") || null,
    };
  }
  if (
    subscription.paymentMethod !== "card" ||
    preapproval.collector_id === undefined ||
    String(preapproval.collector_id) !== sellerId
  ) {
    return { outcome: "ignored_mismatch_seller", reference: subscription.reference };
  }
  if (
    !orderEnvironmentMatches(subscription) ||
    (mpEnv() === "test" && preapproval.live_mode === true) ||
    (mpEnv() === "production" && preapproval.live_mode !== true) ||
    String(preapproval.external_reference ?? "") !== subscription.reference
  ) {
    return { outcome: "ignored_mismatch_reference", reference: subscription.reference };
  }
  const recurring = preapproval.auto_recurring;
  if (
    recurring?.currency_id !== "BRL" ||
    Math.round(Number(recurring.transaction_amount) * 100) !== subscription.amountCents ||
    recurring.frequency !== 1 ||
    recurring.frequency_type !== "months"
  ) {
    return { outcome: "ignored_mismatch_amount", reference: subscription.reference };
  }
  if (!PREAPPROVAL_STATUSES.has(preapproval.status)) {
    return { outcome: "ignored_unknown_status", reference: subscription.reference };
  }

  const status = preapproval.status === "cancelled"
    ? "cancelled"
    : preapproval.status === "paused"
    ? "paused"
    : preapproval.status === "rejected"
    ? "rejected"
    : subscription.paidAt
    ? "active"
    : "pending_payment";
  await db
    .update(schema.clubSubscriptions)
    .set({ preapprovalStatus: preapproval.status, status })
    .where(and(
      eq(schema.clubSubscriptions.id, subscription.id),
      eq(schema.clubSubscriptions.paymentMethod, "card"),
    ));
  return { outcome: "processed", reference: subscription.reference };
}
