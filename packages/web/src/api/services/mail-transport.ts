import { STORE } from "../config/store";

export type MailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
};
export type MailResult =
  | { sent: true; ids: string[] }
  | { sent: false; uncertain: boolean; error: string };

export function mailConfiguration() {
  const from = process.env.EMAIL_FROM?.trim() || process.env.MAIL_FROM?.trim() || STORE.mailFrom;
  const keyPresent = Boolean(process.env.RESEND_API_KEY?.trim());
  return {
    ready: keyPresent,
    from,
    provider: "Resend",
    note: keyPresent
      ? "Envio configurado. O domínio do remetente precisa estar verificado no Resend. Aceito pelo serviço não significa entregue na caixa de entrada."
      : "Envio bloqueado: configure a API key do Resend e verifique o domínio do remetente. Você já pode salvar rascunhos.",
  };
}

/** Uma chamada = um lote; nunca lista todos os destinatários no campo To. */
export async function sendMailBatch(messages: MailMessage[], key: string, batch = true): Promise<MailResult> {
  const config = mailConfiguration();
  if (!config.ready) return { sent: false, uncertain: false, error: "Serviço de e-mail não configurado" };
  if (!messages.length || messages.length > 50) throw new Error("Lote de e-mail inválido");
  const payload = messages.map(({ replyTo, ...m }) => ({
    ...m, from: config.from, to: Array.isArray(m.to) ? m.to : [m.to],
    reply_to: replyTo ?? STORE.notificationEmail,
  }));
  let response: Response;
  try {
    response = await fetch(`https://api.resend.com/emails${batch ? "/batch" : ""}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(batch ? payload : payload[0]),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { sent: false, uncertain: true, error: "Resposta do serviço não recebida. Verifique o painel Resend antes de reenviar." };
  }
  if (!response.ok) {
    return { sent: false, uncertain: response.status >= 500 || response.status === 408,
      error: `Serviço de e-mail respondeu HTTP ${response.status}. ${response.status === 429 ? "Limite de envio atingido." : response.status === 403 ? "O Resend recusou o remetente: o domínio kalangocafe.com.br ainda não está verificado (registros DNS na Hostinger + Verify no Resend). Nada foi enviado." : "Confira API key, remetente e domínio verificado no Resend."}` };
  }
  try {
    const result = await response.json() as { id?: string; data?: { id: string }[] };
    const ids = batch ? result.data?.map((r) => r.id) : result.id ? [result.id] : [];
    if (!ids || ids.length !== messages.length || ids.some((id) => !id)) throw new Error("Resposta incompleta");
    return { sent: true, ids };
  } catch {
    return { sent: false, uncertain: true, error: "Serviço respondeu sem confirmação completa. Verifique o painel Resend; não reenviar cegamente." };
  }
}

export function sendMail(message: MailMessage, key: string) {
  return sendMailBatch([message], key, false);
}

export const escapeEmailHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");