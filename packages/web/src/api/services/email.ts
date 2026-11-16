/**
 * E-mail transacional (Resend).
 *
 * Regra: e-mail nunca derruba pedido. Sem RESEND_API_KEY, ou se a API falhar,
 * a função loga e devolve { sent: false } — o pedido segue gravado no banco.
 * O domínio do remetente (STORE.mailFrom) precisa estar verificado no Resend.
 */
import { randomUUID } from "node:crypto";
import { STORE } from "../config/store";
import { deriveEmailAccessToken } from "./order-access";
import { mailConfiguration, sendMail, type MailMessage } from "./mail-transport";

export const emailReady = mailConfiguration().ready;

const SITE_URL = (process.env.WEBSITE_URL ?? "https://kalangocafe.com.br").replace(/\/$/, "");

type SendInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

async function send(input: SendInput, key: string = randomUUID()) {
  return sendMail(input, key);
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Casca visual dos e-mails: fundo escuro, tipografia grande — mesma pegada do site. */
function shell(title: string, body: string) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#12100E;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#12100E;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#F3EEE4;border-radius:2px;">
        <tr><td style="padding:32px 32px 0;">
          <div style="font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#8A6A4B;">Kalango Cafés Especiais</div>
        </td></tr>
        <tr><td style="padding:20px 32px 32px;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:#231F1B;">
          ${body}
        </td></tr>
        <tr><td style="padding:0 32px 32px;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#6B635A;border-top:1px solid #DDD4C6;padding-top:20px;">
          ${esc(STORE.address.street)}, ${esc(STORE.address.unit)} — ${esc(STORE.address.district)}, ${esc(STORE.address.city)}/${esc(STORE.address.state)}<br>
          ${esc(STORE.phoneLabel)} · <a href="mailto:${STORE.notificationEmail}" style="color:#8A6A4B;">${STORE.notificationEmail}</a><br>
          CNPJ ${esc(STORE.cnpjLabel)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export type OrderEmailItem = {
  name: string;
  grind: string;
  quantity: number;
  unitCents: number;
};

export type OrderEmailData = {
  reference: string;
  customerName: string;
  email: string;
  phone: string;
  items: OrderEmailItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingLabel: string;
  address: {
    street: string;
    number: string;
    complement?: string | null;
    district: string;
    city: string;
    state: string;
    zip: string;
  };
};

function itemsHtml(items: OrderEmailItem[]) {
  return items
    .map(
      (i) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #DDD4C6;">
          <strong>${esc(i.name)}</strong><br>
          <span style="font-size:13px;color:#6B635A;">${esc(i.grind)} · ${i.quantity}x</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #DDD4C6;text-align:right;white-space:nowrap;">
          ${brl(i.unitCents * i.quantity)}
        </td>
      </tr>`
    )
    .join("");
}

function itemsText(items: OrderEmailItem[]) {
  return items
    .map((i) => `- ${i.name} (${i.grind}) ${i.quantity}x — ${brl(i.unitCents * i.quantity)}`)
    .join("\n");
}

function addressLine(a: OrderEmailData["address"]) {
  const comp = a.complement ? `, ${a.complement}` : "";
  return `${a.street}, ${a.number}${comp} — ${a.district}, ${a.city}/${a.state} · CEP ${a.zip}`;
}

/** Templates; envio e registro de tentativas ficam no diário transacional. */
export function orderConfirmationMessages(order: OrderEmailData) {
  const url = `${SITE_URL}/pedido/${encodeURIComponent(order.reference)}?t=${encodeURIComponent(deriveEmailAccessToken(order.reference))}`;
  const totals = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font:400 14px/1.6 Helvetica,Arial,sans-serif;">
      <tr><td style="padding:3px 0;color:#6B635A;">Subtotal</td><td style="padding:3px 0;text-align:right;">${brl(order.subtotalCents)}</td></tr>
      <tr><td style="padding:3px 0;color:#6B635A;">Frete — ${esc(order.shippingLabel)}</td><td style="padding:3px 0;text-align:right;">${order.shippingCents === 0 ? "Grátis" : brl(order.shippingCents)}</td></tr>
      <tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #DDD4C6;">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:700;border-top:1px solid #DDD4C6;">${brl(order.totalCents)}</td></tr>
    </table>`;

  const customer: MailMessage = {
    to: order.email,
    subject: `Pedido ${order.reference} recebido — Kalango Cafés Especiais`,
    html: shell(
      `Pedido ${order.reference}`,
      `<h1 style="margin:0 0 8px;font:700 30px/1.1 Georgia,serif;color:#12100E;">Recebemos seu pedido</h1>
       <p style="margin:0 0 20px;color:#6B635A;">Pedido <strong style="color:#231F1B;">${esc(order.reference)}</strong> · ${esc(order.customerName)}</p>
       <p style="margin:0 0 20px;">Seu café é torrado depois que o pedido entra — por isso o envio sai em até 2 dias úteis. Assim que a torra estiver pronta e a encomenda for postada, a gente manda o código de rastreio por aqui.</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:400 14px/1.6 Helvetica,Arial,sans-serif;">${itemsHtml(order.items)}</table>
       ${totals}
       <p style="margin:24px 0 4px;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8A6A4B;">Entrega</p>
       <p style="margin:0 0 24px;color:#6B635A;">${esc(addressLine(order.address))}</p>
       <a href="${url}" style="display:inline-block;background:#12100E;color:#F3EEE4;text-decoration:none;padding:14px 26px;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;">Acompanhar pedido</a>
       <p style="margin:24px 0 0;color:#6B635A;">Qualquer dúvida é só responder este e-mail ou chamar no WhatsApp ${esc(STORE.phoneLabel)}.</p>`
    ),
    text: `Recebemos seu pedido ${order.reference}.

${itemsText(order.items)}

Subtotal: ${brl(order.subtotalCents)}
Frete (${order.shippingLabel}): ${order.shippingCents === 0 ? "Grátis" : brl(order.shippingCents)}
Total: ${brl(order.totalCents)}

Entrega: ${addressLine(order.address)}

Acompanhe em ${url}
Dúvidas: ${STORE.phoneLabel} ou responda este e-mail.`,
  };

  const internal: MailMessage = {
    to: STORE.notificationEmail,
    subject: `Novo pedido ${order.reference} — ${brl(order.totalCents)}`,
    replyTo: order.email,
    html: shell(
      `Novo pedido ${order.reference}`,
      `<h1 style="margin:0 0 8px;font:700 26px/1.15 Georgia,serif;color:#12100E;">Novo pedido: ${esc(order.reference)}</h1>
       <p style="margin:0 0 20px;color:#6B635A;">${esc(order.customerName)} · ${esc(order.email)} · ${esc(order.phone)}</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:400 14px/1.6 Helvetica,Arial,sans-serif;">${itemsHtml(order.items)}</table>
       ${totals}
       <p style="margin:24px 0 4px;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8A6A4B;">Entrega</p>
       <p style="margin:0;color:#6B635A;">${esc(addressLine(order.address))}</p>`
    ),
    text: `Novo pedido ${order.reference}
${order.customerName} · ${order.email} · ${order.phone}

${itemsText(order.items)}

Subtotal: ${brl(order.subtotalCents)}
Frete (${order.shippingLabel}): ${brl(order.shippingCents)}
Total: ${brl(order.totalCents)}

Entrega: ${addressLine(order.address)}`,
  };

  return { customer, internal };
}

/** Compatibilidade para chamadas antigas; confirmação operacional usa order-email. */
export async function sendOrderConfirmation(order: OrderEmailData) {
  const messages = orderConfirmationMessages(order);
  const [a, b] = await Promise.all([
    send(messages.customer, `order-confirmation/${order.reference}/customer`),
    send(messages.internal, `order-confirmation/${order.reference}/internal`),
  ]);
  return { customer: a.sent, internal: b.sent };
}

/** Aviso de postagem com o código de rastreio. */
export async function sendShippingNotice(input: {
  reference: string;
  customerName: string;
  email: string;
  trackingCode: string;
  shippingLabel: string;
  trackingUrl?: string;
}) {
  const url = input.trackingUrl
    ?? `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(input.trackingCode)}`;
  return send({
    to: input.email,
    subject: `Pedido ${input.reference} a caminho — código ${input.trackingCode}`,
    html: shell(
      `Pedido ${input.reference} enviado`,
      `<h1 style="margin:0 0 8px;font:700 30px/1.1 Georgia,serif;color:#12100E;">Seu café saiu daqui</h1>
       <p style="margin:0 0 20px;color:#6B635A;">Pedido <strong style="color:#231F1B;">${esc(input.reference)}</strong> · ${esc(input.shippingLabel)}</p>
       <p style="margin:0 0 8px;">Torrado, embalado e postado. O código de rastreio é:</p>
       <p style="margin:0 0 24px;font:700 22px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.06em;color:#12100E;">${esc(input.trackingCode)}</p>
       <a href="${url}" style="display:inline-block;background:#12100E;color:#F3EEE4;text-decoration:none;padding:14px 26px;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;">Rastrear entrega</a>
       <p style="margin:24px 0 0;color:#6B635A;">Quando chegar, moa na hora e conta pra gente o que achou.</p>`
    ),
    text: `Pedido ${input.reference} enviado (${input.shippingLabel}).

Código de rastreio: ${input.trackingCode}
Rastreie em: ${url}`,
  });
}
