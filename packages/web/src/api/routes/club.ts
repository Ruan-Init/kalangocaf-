import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { sendClubPixEmail } from "../services/email";
import { subscribeNewsletter } from "../services/newsletter";
import {
  createPixPayment,
  createPreapproval,
  MercadoPagoError,
  mpEnv,
  paymentsConfigured,
  assertSeller,
} from "../services/mercadopago";
import { newReference, sha256 } from "../services/order-access";

const PLANS = {
  descoberta: { name: "Descoberta", amountCents: 7900 },
  duo: { name: "Duo", amountCents: 14900 },
  obsessao: { name: "Obsessão", amountCents: 25900 },
} as const;

const inputSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  plan: z.enum(["descoberta", "duo", "obsessao"]),
  paymentMethod: z.enum(["pix", "card"]).default("pix"),
  cardConsent: z.boolean().optional(),
  newsletterOptIn: z.boolean().default(false),
  name: z.string().trim().min(3).max(120),
  email: z.email().max(200),
  phone: z.string().regex(/^\d{10,11}$/),
  document: z.string().regex(/^\d{11}$/),
  zip: z.string().regex(/^\d{8}$/),
  street: z.string().trim().min(3).max(200),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
}).superRefine((input, ctx) => {
  if (input.paymentMethod === "card" && input.cardConsent !== true) {
    ctx.addIssue({
      code: "custom",
      path: ["cardConsent"],
      message: "É necessário autorizar as cobranças mensais no cartão.",
    });
  }
});

type ClubInput = z.infer<typeof inputSchema>;

function validCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = [...cpf].map(Number);
  for (let length = 9; length <= 10; length++) {
    const sum = digits
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const check = ((sum * 10) % 11) % 10;
    if (check !== digits[length]) return false;
  }
  return true;
}

function fingerprint(input: ClubInput) {
  const { idempotencyKey: _key, ...data } = input;
  return sha256(JSON.stringify(data));
}

async function findByKey(idempotencyHash: string) {
  const [subscription] = await db
    .select()
    .from(schema.clubSubscriptions)
    .where(eq(schema.clubSubscriptions.idempotencyHash, idempotencyHash))
    .limit(1);
  return subscription ?? null;
}

async function preparePix(subscription: schema.ClubSubscription, document: string) {
  if (subscription.pixCode && subscription.pixQrCodeBase64 && subscription.pixExpiresAt) {
    return {
      paymentId: subscription.mpPaymentId!,
      status: subscription.paymentStatus,
      statusDetail: subscription.paymentStatusDetail,
      qrCode: subscription.pixCode,
      qrCodeBase64: subscription.pixQrCodeBase64,
      expiresAt: subscription.pixExpiresAt,
    };
  }
  const plan = PLANS[subscription.plan as keyof typeof PLANS];
  if (!plan) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Plano do Clube inválido." });
  try {
    const pix = await createPixPayment({
      reference: subscription.reference,
      amountCents: subscription.amountCents,
      description: `Clube Kalango — ${plan.name}`,
      payer: {
        name: subscription.customerName,
        email: subscription.email,
        document,
        zip: subscription.zip,
        street: subscription.street,
        number: subscription.number,
        district: subscription.district,
        city: subscription.city,
        state: subscription.state,
      },
      idempotencyKey: sha256(`club-pix:${subscription.reference}`),
    });
    await db
      .update(schema.clubSubscriptions)
      .set({
        mpPaymentId: pix.paymentId,
        paymentStatus: pix.status,
        paymentStatusDetail: pix.statusDetail,
        pixCode: pix.qrCode,
        pixQrCodeBase64: pix.qrCodeBase64,
        pixExpiresAt: pix.expiresAt,
      })
      .where(eq(schema.clubSubscriptions.id, subscription.id));
    return pix;
  } catch (error) {
    const message =
      error instanceof MercadoPagoError
        ? error.message
        : "Falha inesperada ao criar o Pix do Clube";
    console.error(`[club] Pix de ${subscription.reference} falhou: ${message}`);
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Não conseguimos gerar o Pix agora. Seus dados foram salvos; tente novamente.",
    });
  }
}

async function prepareCardSubscription(subscription: schema.ClubSubscription) {
  if (subscription.mpPreapprovalId && subscription.mpPreapprovalUrl) {
    return {
      preapprovalId: subscription.mpPreapprovalId,
      checkoutUrl: subscription.mpPreapprovalUrl,
      status: subscription.preapprovalStatus ?? "pending",
    };
  }
  const plan = PLANS[subscription.plan as keyof typeof PLANS];
  if (!plan) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Plano do Clube inválido." });
  try {
    const preapproval = await createPreapproval({
      reference: subscription.reference,
      planName: plan.name,
      amountCents: subscription.amountCents,
      email: subscription.email,
      idempotencyKey: sha256(`club-preapproval:${subscription.reference}`),
    });
    await db
      .update(schema.clubSubscriptions)
      .set({
        mpPreapprovalId: preapproval.preapprovalId,
        mpPreapprovalUrl: preapproval.checkoutUrl,
        preapprovalStatus: preapproval.status,
      })
      .where(eq(schema.clubSubscriptions.id, subscription.id));
    return preapproval;
  } catch (error) {
    const message = error instanceof MercadoPagoError
      ? error.message
      : "Falha inesperada ao criar a assinatura mensal";
    console.error(`[club] assinatura no cartão de ${subscription.reference} falhou: ${message}`);
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Não conseguimos abrir o cadastro do cartão agora. Seus dados foram salvos; tente novamente.",
    });
  }
}

export const club = {
  create: base.input(inputSchema).handler(async ({ input }) => {
    if (!validCpf(input.document)) {
      throw new ORPCError("BAD_REQUEST", { message: "Confira o CPF informado." });
    }
    if (!paymentsConfigured()) {
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "Pagamento indisponível no momento. Fale com a gente pelo WhatsApp.",
      });
    }
    try {
      await assertSeller();
    } catch (error) {
      console.error("[club] pagamento bloqueado:", (error as Error).message);
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "Pagamento indisponível no momento. Fale com a gente pelo WhatsApp.",
      });
    }

    const idempotencyHash = sha256(input.idempotencyKey);
    const requestFingerprint = fingerprint(input);
    let subscription = await findByKey(idempotencyHash);
    if (subscription && subscription.requestFingerprint !== requestFingerprint) {
      throw new ORPCError("CONFLICT", {
        message:
          "Essa tentativa já foi usada com outros dados. Recarregue a página e tente novamente.",
      });
    }
    if (!subscription) {
      const plan = PLANS[input.plan];
      const reference = newReference().replace(/^KLG-/, "CLB-");
      try {
        [subscription] = await db
          .insert(schema.clubSubscriptions)
          .values({
            reference,
            idempotencyHash,
            requestFingerprint,
            plan: input.plan,
            amountCents: plan.amountCents,
            paymentMethod: input.paymentMethod,
            customerName: input.name,
            email: input.email.trim().toLowerCase(),
            phone: input.phone,
            zip: input.zip,
            street: input.street,
            number: input.number,
            complement: input.complement || null,
            district: input.district,
            city: input.city,
            state: input.state.toUpperCase(),
            isTest: mpEnv() === "test",
          })
          .returning();
      } catch (error) {
        subscription = await findByKey(idempotencyHash);
        if (!subscription) throw error;
        if (subscription.requestFingerprint !== requestFingerprint) {
          throw new ORPCError("CONFLICT", {
            message: "Essa tentativa já foi usada com outros dados.",
          });
        }
      }
    }

    if (input.newsletterOptIn) {
      await subscribeNewsletter(subscription.customerName, subscription.email, "clube");
    }

    if (input.paymentMethod === "card") {
      const preapproval = await prepareCardSubscription(subscription);
      return {
        paymentMethod: "card" as const,
        reference: subscription.reference,
        plan: PLANS[subscription.plan as keyof typeof PLANS].name,
        amountCents: subscription.amountCents,
        checkoutUrl: preapproval.checkoutUrl,
      };
    }

    const pix = await preparePix(subscription, input.document);
    const plan = PLANS[subscription.plan as keyof typeof PLANS];
    const email = await sendClubPixEmail({
      reference: subscription.reference,
      customerName: subscription.customerName,
      email: subscription.email,
      planName: plan.name,
      amountCents: subscription.amountCents,
      pixCode: pix.qrCode,
      expiresAt: pix.expiresAt,
    });
    if (!email.sent) {
      console.error(
        `[club] Pix gerado, mas o e-mail de ${subscription.reference} não foi aceito: ${email.error}`,
      );
    }
    return {
      paymentMethod: "pix" as const,
      reference: subscription.reference,
      plan: plan.name,
      amountCents: subscription.amountCents,
      pixCode: pix.qrCode,
      pixQrCodeBase64: pix.qrCodeBase64,
      expiresAt: pix.expiresAt,
      paymentStatus: pix.status,
      emailSent: email.sent,
    };
  }),
};
