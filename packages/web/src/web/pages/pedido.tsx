import { useEffect, useMemo, useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { AlertTriangle, Check, Clock, FlaskConical, RefreshCw } from "lucide-react";
import { useOrderStatus, useResumePayment } from "../queries/orders";
import { SectionLabel, Spinner } from "../components/primitives";
import { brl, installmentsNote } from "../lib/format";
import { WHATSAPP } from "../components/layout";
import { useSeo } from "../lib/seo";
import { useCart } from "../lib/cart";
import { getOrderToken, isMercadoPagoUrl, saveOrderToken } from "../lib/order-access";

const STATUS: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pagamento confirmado",
  roasting: "Em torra",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const PAYMENT: Record<string, string> = {
  awaiting: "Pagamento não iniciado",
  preference_error: "Pagamento não abriu",
  pending: "Pagamento pendente",
  in_process: "Pagamento em análise",
  authorized: "Pagamento autorizado",
  approved: "Pagamento aprovado",
  rejected: "Pagamento recusado",
  cancelled: "Pagamento cancelado",
  refunded: "Pagamento estornado",
  charged_back: "Pagamento contestado",
  in_mediation: "Pagamento em disputa",
};

/** Por quanto tempo a página confere sozinha a situação do pagamento. */
const POLL_WINDOW_MS = 2 * 60_000;

type Tone = "ok" | "wait" | "bad";

function headline(o: { paid: boolean; paymentStatus: string | null; status: string; isTest: boolean }): {
  tone: Tone;
  tag: string;
  text: string;
} {
  if (o.paid && o.paymentStatus === "approved") {
    return {
      tone: "ok",
      tag: "Pagamento aprovado",
      text: o.isTest
        ? "Pagamento de teste aprovado pelo Mercado Pago. Pedido de teste não entra na torra nem é enviado."
        : "Pagamento aprovado pelo Mercado Pago. Seu pedido entrou na fila da torra.",
    };
  }
  if (o.paid) {
    return {
      tone: "bad",
      tag: PAYMENT[o.paymentStatus ?? ""] ?? "Pagamento em revisão",
      text: "Houve uma alteração no pagamento deste pedido. Fale com a gente pelo WhatsApp.",
    };
  }
  if (o.status === "cancelled") {
    return { tone: "bad", tag: "Pedido cancelado", text: "Este pedido foi cancelado." };
  }
  switch (o.paymentStatus) {
    case "pending":
    case "in_process":
    case "authorized":
      return {
        tone: "wait",
        tag: "Aguardando confirmação",
        text:
          "O Mercado Pago ainda não confirmou o pagamento. Se escolheu Pix, conclua o pagamento no app do banco — esta página atualiza sozinha por alguns minutos.",
      };
    case "rejected":
      return {
        tone: "bad",
        tag: "Pagamento não aprovado",
        text: "O pagamento foi recusado. Seu pedido continua salvo: você pode tentar de novo, com outro cartão ou Pix.",
      };
    case "cancelled":
      return {
        tone: "bad",
        tag: "Pagamento não concluído",
        text: "O pagamento foi cancelado ou expirou. O pedido continua salvo se quiser tentar de novo.",
      };
    case "preference_error":
      return {
        tone: "bad",
        tag: "Pagamento não abriu",
        text: "Não conseguimos abrir a tela do Mercado Pago. Seu pedido está salvo — tente de novo em instantes.",
      };
    default:
      return {
        tone: "wait",
        tag: "Pedido registrado",
        text: "Ainda não recebemos o pagamento. Se você fechou a tela do Mercado Pago, é só retomar abaixo.",
      };
  }
}

export default function Pedido() {
  const [, params] = useRoute("/pedido/:reference");
  const reference = params?.reference ?? "";
  const search = useSearch();
  const { settlePurchase } = useCart();
  useSeo({ title: "Pedido", description: "", path: "/pedido", noindex: true });

  const query = useMemo(() => new URLSearchParams(search), [search]);
  const token = query.get("t") ?? (reference ? getOrderToken(reference) : null);
  // Pista do retorno do Mercado Pago — o servidor confere tudo na API.
  const hint = query.get("payment_id") ?? query.get("collection_id") ?? undefined;
  const paymentId = hint && /^\d{1,20}$/.test(hint) ? hint : undefined;

  useEffect(() => {
    if (reference && query.get("t")) saveOrderToken(reference, query.get("t")!);
  }, [reference, query]);

  const [pollUntil, setPollUntil] = useState(() => Date.now() + POLL_WINDOW_MS);
  const [polling, setPolling] = useState(true);
  useEffect(() => {
    setPolling(true);
    const t = window.setTimeout(() => setPolling(false), Math.max(0, pollUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [pollUntil]);

  const order = useOrderStatus(reference, token, paymentId, polling);
  const resume = useResumePayment();
  const [resumeError, setResumeError] = useState<string | null>(null);

  const o = order.data;
  useEffect(() => {
    if (o?.paid && o.paymentStatus === "approved") settlePurchase(o.reference, o.items);
  }, [o?.paid, o?.paymentStatus, o?.reference, o?.items, settlePurchase]);

  async function pay() {
    if (!token) return;
    setResumeError(null);
    try {
      const res = await resume.mutateAsync({ reference, token });
      if (res.checkoutUrl && isMercadoPagoUrl(res.checkoutUrl)) {
        window.location.assign(res.checkoutUrl);
        return;
      }
      if (res.alreadyPaid) {
        await order.refetch();
        return;
      }
      setResumeError(res.error ?? "Não conseguimos abrir o pagamento agora.");
      await order.refetch();
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Não conseguimos abrir o pagamento agora.");
    }
  }

  function refresh() {
    setPollUntil(Date.now() + POLL_WINDOW_MS);
    void order.refetch();
  }

  if (!token) {
    return (
      <>
        <div className="h-24 bg-ink md:h-28" />
        <div className="shell flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <p className="display text-5xl">Link do pedido necessário</p>
        <p className="max-w-md text-muted">
          Por segurança, o pedido {reference} só abre pelo link completo recebido ao finalizar a
          compra. Se perdeu o link, fale com a gente pelo WhatsApp.
        </p>
        <a
          href={WHATSAPP}
          className="label border border-ink px-8 py-4 transition-colors hover:bg-ink hover:text-cream"
        >
          Falar no WhatsApp
        </a>
        </div>
      </>
    );
  }

  if (order.isLoading) {
    return (
      <>
        <div className="h-24 bg-ink md:h-28" />
        <div className="shell flex min-h-[70vh] items-center justify-center">
        <span className="label flex items-center gap-3 text-muted">
          <Spinner /> Conferindo o pedido…
        </span>
        </div>
      </>
    );
  }

  if (!o) {
    return (
      <>
        <div className="h-24 bg-ink md:h-28" />
        <div className="shell flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <p className="display text-5xl">Pedido não encontrado</p>
        <p className="text-muted">Confira o link do pedido {reference}.</p>
        <Link
          to="/loja"
          className="label border border-ink px-8 py-4 transition-colors hover:bg-ink hover:text-cream"
        >
          Voltar à loja
        </Link>
        </div>
      </>
    );
  }

  const h = headline(o);
  const Icon = h.tone === "ok" ? Check : h.tone === "wait" ? Clock : AlertTriangle;
  const stillChecking = polling && !o.paid && o.canPay &&
    ["awaiting", "pending", "in_process", "authorized"].includes(o.paymentStatus ?? "awaiting");

  return (
    <>
      <section
        className="grain relative overflow-hidden bg-ink pt-40 pb-20 text-cream md:pt-48"
      >
        <div className="absolute -top-20 right-10 size-[420px] rounded-full bg-lime/25 blur-[150px]" />
        <div className="shell relative">
          <span
            className={`label inline-flex items-center gap-2 ${h.tone === "ok" ? "text-lime" : h.tone === "wait" ? "text-gold" : "text-red"}`}
          >
            <Icon className="size-4" strokeWidth={2} /> {h.tag}
          </span>
          <h1 className="display mt-8 text-[11vw] leading-[0.88] md:text-[7vw]">
            {h.tone === "ok" ? "Obrigado," : "Quase lá,"}
            <br />
            <span className="text-jungle">{o.customerName.split(" ")[0]}</span>
          </h1>
          <p className="mt-8 max-w-lg text-cream/70">
            Pedido <strong className="text-cream">{o.reference}</strong>. {h.text}
          </p>
          {!o.paid && (
            <p className="mt-4 max-w-lg text-xs text-cream/50">
              Guarde o link desta página: ele é o acesso ao seu pedido.
            </p>
          )}
        </div>
      </section>
      {o.isTest && (
        <div className="border-b border-ink/15 bg-gold/25">
          <p className="shell flex items-center gap-3 py-4 text-sm">
            <FlaskConical className="size-4 shrink-0" strokeWidth={1.8} />
            <strong>Pedido de teste — use apenas contas e cartões de teste. Nada é cobrado nem enviado.</strong>
          </p>
        </div>
      )}

      <section className="shell grid gap-14 py-16 md:py-24 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <SectionLabel index="01">Itens</SectionLabel>
          <div className="mt-8 divide-y divide-ink/12 border-y border-ink/12">
            {o.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-6 py-5">
                <div>
                  <p className="display text-xl">{item.name}</p>
                  <p className="label mt-1 text-muted">
                    {item.grind} • {item.quantity}x
                  </p>
                </div>
                <span className="text-sm">{brl(item.unitCents * item.quantity)}</span>
              </div>
            ))}
          </div>

          <SectionLabel className="mt-16" index="02">Entrega</SectionLabel>
          <div className="mt-8 grid gap-6 text-sm md:grid-cols-2">
            <div>
              <p className="label text-muted">Endereço</p>
              <p className="mt-3 leading-relaxed">
                {o.street}, {o.number}
                {o.complement ? ` — ${o.complement}` : ""}
                <br />
                {o.district} • {o.city}/{o.state}
                <br />
                CEP {o.zip}
              </p>
            </div>
            <div>
              <p className="label text-muted">Método</p>
              <p className="mt-3">{o.shippingMethod}</p>
              {o.shippingTrackingCode && (
                <p className="mt-2 text-muted">Rastreio: {o.shippingTrackingCode}</p>
              )}
            </div>
          </div>
        </div>

        <aside className="h-fit border border-ink/15 p-8">
          <SectionLabel index="—">Resumo</SectionLabel>
          <p className="display mt-6 text-3xl">
            {o.paid ? (STATUS[o.status] ?? o.status) : (PAYMENT[o.paymentStatus ?? ""] ?? STATUS[o.status])}
          </p>
          {o.paid && o.paymentStatus && o.paymentStatus !== "approved" && (
            <p className="label mt-2 text-red">{PAYMENT[o.paymentStatus] ?? o.paymentStatus}</p>
          )}
          {stillChecking && (
            <p className="label mt-3 flex items-center gap-2 text-muted">
              <Spinner /> Conferindo com o Mercado Pago…
            </p>
          )}
          {o.syncError && <p className="mt-3 text-xs text-red">{o.syncError}</p>}

          <div className="mt-8 space-y-3 border-t border-ink/12 pt-6 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span>{brl(o.subtotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Frete</span>
              <span>{o.shippingCents === 0 ? "Grátis" : brl(o.shippingCents)}</span>
            </div>
            <div className="flex items-end justify-between border-t border-ink/12 pt-4">
              <span className="label text-muted">Total</span>
              <span className="display text-3xl">{brl(o.totalCents)}</span>
            </div>
          </div>

          {o.canPay && (
            <>
              <button
                type="button"
                onClick={pay}
                disabled={resume.isPending}
                className="label mt-8 flex w-full items-center justify-center gap-3 bg-jungle px-6 py-4 text-cream transition-colors hover:bg-ink disabled:opacity-60"
              >
                {resume.isPending && <Spinner />}
                {o.paymentStatus === "rejected" || o.paymentStatus === "cancelled" ||
                    o.paymentStatus === "preference_error"
                  ? "Tentar pagar de novo"
                  : "Ir para o pagamento"}
              </button>
              <p className="mt-2 text-center text-xs text-muted">{installmentsNote()}</p>
              {resumeError && <p role="alert" className="mt-3 text-xs text-red">{resumeError}</p>}
            </>
          )}
          {!o.paid && (
            <button
              type="button"
              onClick={refresh}
              disabled={order.isFetching}
              className="label mt-3 flex w-full items-center justify-center gap-2 border border-ink/20 px-6 py-3 text-ink transition-colors hover:border-ink disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${order.isFetching ? "animate-spin" : ""}`} />
              Atualizar status
            </button>
          )}
          <a
            href={WHATSAPP}
            className="label mt-3 block bg-ink px-6 py-4 text-center text-cream transition-colors hover:bg-jungle"
          >
            Falar sobre o pedido
          </a>
          <Link
            to="/loja"
            className="label mt-3 block py-2 text-center text-muted hover:text-ink"
          >
            Continuar comprando
          </Link>
        </aside>
      </section>
    </>
  );
}
