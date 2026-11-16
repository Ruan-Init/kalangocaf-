/**
 * Painel de gestão da torrefação — /gestao.
 *
 * Sem área logada no site, o acesso é por senha compartilhada (OPS_TOKEN no
 * servidor). A senha fica no localStorage pra não redigitar a cada visita.
 * Página fora do Layout do site (sem header/carrinho) e com noindex.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Lock, LogOut, Package, RefreshCw, Truck } from "lucide-react";
import { brl } from "../lib/format";
import { cn } from "../lib/utils";
import { useSeo } from "../lib/seo";
import { Spinner } from "../components/primitives";
import { ReceitasPainel } from "../components/gestao-receitas";
import { LifestylePainel } from "../components/gestao-lifestyle";
import { CafesPainel } from "../components/gestao-cafes";
import { BlingPainel } from "../components/gestao-bling";
import { NewsletterPainel } from "../components/gestao-newsletter";
import {
  useAdminLeads,
  useAdminOrders,
  useAdminSummary,
  useCheckToken,
  useSetStatus,
  useShipOrder,
  useRetryConfirmation,
} from "../queries/admin";

const STORAGE_KEY = "kalango.ops.token";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pago",
  roasting: "Em torra",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_ORDER = [
  "pending_payment",
  "paid",
  "roasting",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const STATUS_TONE: Record<string, string> = {
  pending_payment: "border-gold/50 text-gold",
  paid: "border-jungle-lit/60 text-jungle-lit",
  roasting: "border-sky/50 text-sky",
  shipped: "border-ocean/50 text-ocean",
  delivered: "border-lime/60 text-lime",
  cancelled: "border-red/40 text-red/80",
};

const LEAD_LABEL: Record<string, string> = {
  contato: "Contato",
  atacado: "Atacado",
  clube: "Clube",
  newsletter: "Newsletter",
  lifestyle: "Lifestyle",
};

function readToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

function dataHora(value: Date | string | number) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */

function Entrada({ onEnter }: { onEnter: (token: string) => void }) {
  const [value, setValue] = useState("");
  const check = useCheckToken();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    check.mutate(
      { token: value.trim() },
      {
        onSuccess: () => {
          window.localStorage.setItem(STORAGE_KEY, value.trim());
          onEnter(value.trim());
        },
      }
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6 text-cream">
      <form onSubmit={submit} className="w-full max-w-sm">
        <span className="label flex items-center gap-2 text-jungle">
          <Lock className="size-3.5" strokeWidth={1.6} />
          Gestão Kalango
        </span>
        <h1 className="display mt-6 text-5xl leading-[0.9]">Entrar</h1>
        <p className="mt-4 text-sm text-cream/60">
          Senha de operação. Se ninguém configurou ainda, o painel fica fechado.
        </p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Senha de operação"
          placeholder="••••••••"
          autoComplete="current-password"
          className="mt-8 w-full border-b border-cream/25 bg-transparent pb-3 text-lg outline-none transition-colors placeholder:text-cream/25 focus:border-jungle"
        />
        {check.error && (
          <p className="mt-4 text-sm text-red">{check.error.message}</p>
        )}
        <button
          type="submit"
          disabled={check.isPending || !value.trim()}
          className="label mt-8 flex w-full items-center justify-center gap-2 border border-cream px-8 py-4 transition-colors hover:border-jungle hover:bg-jungle disabled:opacity-40"
        >
          {check.isPending ? <Spinner /> : "Abrir painel"}
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Resumo({ token }: { token: string }) {
  const summary = useAdminSummary(token);
  const d = summary.data;

  const cards = [
    { label: "Pedidos", value: d ? String(d.total) : "—" },
    { label: "Pra despachar", value: d ? String(d.aFazer) : "—" },
    { label: "Faturado", value: d ? brl(d.faturadoCents) : "—" },
    { label: "Contatos", value: d ? String(d.leads) : "—" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-px bg-cream/10 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-ink px-5 py-6">
            <span className="label text-cream/45">{c.label}</span>
            <p className="display mt-3 text-4xl leading-none">{c.value}</p>
          </div>
        ))}
      </div>
      {d && d.testes > 0 && (
        <p className="mt-3 text-xs text-cream/45">
          {d.testes} pedido(s) de teste do Mercado Pago ficam fora desses totais e da fila.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const PAYMENT_LABEL: Record<string, string> = {
  awaiting: "aguardando pagamento",
  preference_error: "erro ao abrir pagamento",
  pending: "pendente",
  in_process: "em análise",
  authorized: "autorizado",
  approved: "aprovado",
  rejected: "recusado",
  cancelled: "cancelado",
  refunded: "estornado",
  charged_back: "contestado (chargeback)",
  in_mediation: "em disputa",
};

type OrderRow = NonNullable<ReturnType<typeof useAdminOrders>["data"]>[number];

function Pedido({ order, token }: { order: OrderRow; token: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState(order.shippingTrackingCode ?? "");
  const [aviso, setAviso] = useState<string | null>(null);
  const setStatus = useSetStatus();
  const ship = useShipOrder();
  const confirmation = useRetryConfirmation();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [["admin"]] });
    void qc.invalidateQueries();
  };

  const mudarStatus = (status: string) => {
    setAviso(null);
    setStatus.mutate(
      { token, reference: order.reference, status: status as never },
      { onSuccess: refresh, onError: (e) => setAviso(e.message) }
    );
  };

  const despachar = () => {
    if (tracking.trim().length < 4) {
      setAviso("Digite o código de rastreio.");
      return;
    }
    setAviso(null);
    ship.mutate(
      { token, reference: order.reference, trackingCode: tracking.trim() },
      {
        onSuccess: (r) => {
          setAviso(
            r.emailSent
              ? "Marcado como enviado. E-mail com o rastreio saiu pro cliente."
              : "Marcado como enviado, mas o e-mail NÃO saiu (RESEND_API_KEY não configurada). Avise o cliente na mão."
          );
          refresh();
        },
        onError: (e) => setAviso(e.message),
      }
    );
  };

  const endereco = `${order.street}, ${order.number}${
    order.complement ? `, ${order.complement}` : ""
  } — ${order.district}, ${order.city}/${order.state} · CEP ${order.zip}`;

  return (
    <div className="border-b border-cream/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-5 text-left transition-colors hover:bg-cream/5"
      >
        <span
          className={cn(
            "label shrink-0 border px-2.5 py-1 text-[9px]",
            STATUS_TONE[order.status] ?? "border-cream/20 text-cream/60"
          )}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
        {order.isTest && (
          <span className="label shrink-0 border border-gold/60 px-2 py-1 text-[9px] text-gold">
            Teste
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px]">{order.customerName}</span>
          <span className="block text-xs text-cream/45">
            {order.reference} · {dataHora(order.createdAt)} · {order.city}/{order.state}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px]">{brl(order.totalCents)}</span>
          <span className="block text-xs text-cream/45">
            {order.items.reduce((s, i) => s + i.quantity, 0)} item(s)
          </span>
        </span>
      </button>

      {open && (
        <div className="grid gap-8 border-t border-cream/10 bg-ink-soft px-5 py-6 md:grid-cols-2">
          <div>
            <span className="label text-cream/45">Itens</span>
            <ul className="mt-3 space-y-2 text-sm">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4">
                  <span>
                    {i.quantity}x {i.name}
                    <span className="text-cream/45"> · {i.grind}</span>
                  </span>
                  <span className="shrink-0">{brl(i.unitCents * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 border-t border-cream/10 pt-4 text-sm">
              <p className="flex justify-between">
                <span className="text-cream/45">Subtotal</span>
                <span>{brl(order.subtotalCents)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-cream/45">Frete · {order.shippingMethod}</span>
                <span>{order.shippingCents === 0 ? "Grátis" : brl(order.shippingCents)}</span>
              </p>
              <p className="flex justify-between font-medium">
                <span>Total</span>
                <span>{brl(order.totalCents)}</span>
              </p>
            </div>
            {order.notes && (
              <p className="mt-4 border-l-2 border-jungle/60 pl-3 text-sm text-cream/70">
                {order.notes}
              </p>
            )}
          </div>

          <div>
            <span className="label text-cream/45">Cliente</span>
            <div className="mt-3 space-y-1 text-sm">
              <p>{order.customerName}</p>
              <p className="text-cream/70">
                <a href={`mailto:${order.email}`} className="hover:text-jungle">{order.email}</a>
              </p>
              <p className="text-cream/70">
                <a
                  href={`https://wa.me/55${order.phone.replace(/\D/g, "").slice(-11)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-jungle"
                >
                  {order.phone}
                </a>
              </p>
              <p className="text-cream/70">CPF {order.document}</p>
            </div>

            <div className="mt-5 flex items-start gap-2">
              <p className="flex-1 text-sm text-cream/70">{endereco}</p>
              <button
                type="button"
                aria-label="Copiar endereço"
                onClick={() => void navigator.clipboard?.writeText(endereco)}
                className="shrink-0 border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
              >
                <Copy className="size-3.5" strokeWidth={1.6} />
              </button>
            </div>

            {order.paymentStatus && (
              <p className="mt-5 text-xs text-cream/60">
                Mercado Pago: {PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus}
                {order.mpPaymentId ? ` · pagamento ${order.mpPaymentId}` : ""}
                {order.paymentStatusDetail ? ` · ${order.paymentStatusDetail}` : ""}
              </p>
            )}

            {!order.isTest && order.paidAt && <div className="mt-5 border border-cream/15 p-4 text-xs">
              <p className="label text-cream/50">Confirmação por e-mail</p>
              {(order.confirmationEmails ?? []).map((email) => <div key={email.audience} className="mt-3">
                <p>{email.audience === "customer" ? "Cliente" : "Cópia da torrefação"}: {email.status === "accepted" ? "aceito pelo serviço" : email.status === "failed" ? "não enviado" : email.status === "uncertain" ? "resultado incerto — conferir no Resend" : "aguardando envio / retorno do serviço"}</p>
                {email.error && <p className="mt-1 text-red/80">{email.error}</p>}
              </div>)}
              <p className="mt-3 text-cream/40">Aceito pelo serviço não garante chegada à caixa de entrada. Falhas podem ser tentadas novamente; aceitos e incertos não são repetidos.</p>
              <button className="label mt-4 border border-cream/20 px-3 py-2 text-[9px] disabled:opacity-40" disabled={confirmation.isPending || ((order.confirmationEmails ?? []).length > 0 && !(order.confirmationEmails ?? []).some((e) => ["failed", "pending"].includes(e.status)))} onClick={() => {
                if (!window.confirm(`Tentar enviar a confirmação pendente do pedido ${order.reference}?`)) return;
                confirmation.mutate({ token, reference: order.reference }, { onSuccess: (r) => { setAviso(r.emails.some((e) => e.status === "failed") ? "Confirmação não enviada. Confira o serviço e o remetente." : "Tentativa registrada. Confira o status da confirmação."); refresh(); }, onError: (e) => setAviso(e.message) });
              }}>{confirmation.isPending ? "Enviando…" : "Tentar confirmação novamente"}</button>
            </div>}

            {!order.isTest && (order.blingOrderId || order.blingError) && (
              <p className={cn("mt-2 text-xs", order.blingOrderId ? "text-lime" : "text-red")}>
                {order.blingOrderId
                  ? `Bling: pedido de venda nº ${order.blingOrderNumber ?? order.blingOrderId}`
                  : `Bling: não enviado — ${order.blingError}`}
              </p>
            )}

            {order.isTest ? (
              <div className="mt-7 border border-gold/40 p-4 text-sm text-cream/70">
                <p>
                  Pedido de <strong className="text-gold">teste</strong>: não vai para torra,
                  envio, estoque nem faturamento.
                </p>
                {order.status !== "cancelled" && (
                  <button
                    type="button"
                    disabled={setStatus.isPending}
                    onClick={() => mudarStatus("cancelled")}
                    className="label mt-3 border border-cream/20 px-3 py-2 text-[9px] text-cream/60 transition-colors hover:border-cream hover:text-cream"
                  >
                    Cancelar teste
                  </button>
                )}
                {aviso && <p className="mt-3 text-sm text-red">{aviso}</p>}
              </div>
            ) : (
            <>
            <span className="label mt-7 block text-cream/45">Etapa</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={setStatus.isPending || s === order.status}
                  onClick={() => mudarStatus(s)}
                  className={cn(
                    "label border px-3 py-2 text-[9px] transition-colors disabled:opacity-100",
                    s === order.status
                      ? "border-jungle bg-jungle text-ink"
                      : "border-cream/20 text-cream/60 hover:border-cream hover:text-cream"
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            <span className="label mt-7 block text-cream/45">Rastreio</span>
            <div className="mt-3 flex gap-2">
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value.toUpperCase())}
                aria-label="Código de rastreio"
                placeholder="AA123456789BR"
                className="min-w-0 flex-1 border-b border-cream/25 bg-transparent pb-2 text-sm outline-none placeholder:text-cream/25 focus:border-jungle"
              />
              <button
                type="button"
                onClick={despachar}
                disabled={ship.isPending}
                className="label flex shrink-0 items-center gap-2 border border-cream/25 px-4 py-2 text-[9px] transition-colors hover:border-jungle hover:bg-jungle hover:text-ink disabled:opacity-40"
              >
                {ship.isPending ? <Spinner /> : <Truck className="size-3.5" strokeWidth={1.6} />}
                Enviar
              </button>
            </div>
            {order.shippingTrackingCode && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-lime">
                <Check className="size-3" strokeWidth={2} />
                Rastreio salvo: {order.shippingTrackingCode}
              </p>
            )}
            {aviso && <p className="mt-3 text-sm text-red">{aviso}</p>}
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Leads({ token }: { token: string }) {
  const leads = useAdminLeads(token);

  if (leads.isLoading) {
    return <p className="px-5 py-8 text-sm text-cream/45">Carregando contatos…</p>;
  }
  if (!leads.data?.length) {
    return <p className="px-5 py-8 text-sm text-cream/45">Nenhum contato ainda.</p>;
  }

  return (
    <div>
      {leads.data.map((l) => (
        <div key={l.id} className="border-b border-cream/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="label border border-cream/20 px-2.5 py-1 text-[9px] text-cream/60">
              {LEAD_LABEL[l.kind] ?? l.kind}
            </span>
            <span className="text-[15px]">{l.name}</span>
            <span className="ml-auto text-xs text-cream/45">{dataHora(l.createdAt)}</span>
          </div>
          <p className="mt-2 text-sm text-cream/70">
            <a href={`mailto:${l.email}`} className="hover:text-jungle">{l.email}</a>
            {l.phone ? ` · ${l.phone}` : ""}
            {l.company ? ` · ${l.company}` : ""}
            {l.plan ? ` · plano ${l.plan}` : ""}
          </p>
          {l.message && <p className="mt-2 text-sm text-cream/60">{l.message}</p>}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function Gestao() {
  useSeo({ title: "Gestão", description: "", path: "/gestao", noindex: true });
  const [token, setToken] = useState(readToken);
  const [aba, setAba] = useState<"pedidos" | "cafes" | "receitas" | "lifestyle" | "contatos" | "newsletter" | "bling">(() => {
    if (typeof window === "undefined") return "pedidos";
    const a = new URLSearchParams(window.location.search).get("aba");
    return a === "bling" || a === "cafes" || a === "lifestyle" || a === "receitas" || a === "contatos" || a === "newsletter" ? a : "pedidos";
  });
  const [filtro, setFiltro] = useState<string>("");
  const qc = useQueryClient();

  const orders = useAdminOrders(token, filtro || undefined);
  const lista = useMemo(() => orders.data ?? [], [orders.data]);

  if (!token) return <Entrada onEnter={setToken} />;

  // Token salvo mas recusado pelo servidor (mudou o OPS_TOKEN): volta pra entrada.
  if (orders.error && /senha|token|desativado/i.test(orders.error.message)) {
    return (
      <Entrada
        onEnter={setToken}
      />
    );
  }

  const sair = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setToken("");
  };

  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="border-b border-cream/10 px-5 py-6 md:px-8">
        <div className="mx-auto flex max-w-[1100px] items-center gap-4">
          <span className="label flex items-center gap-2 text-jungle">
            <Package className="size-3.5" strokeWidth={1.6} />
            Gestão Kalango
          </span>
          <button
            type="button"
            aria-label="Atualizar dados"
            onClick={() => void qc.invalidateQueries()}
            className="ml-auto border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
          >
            <RefreshCw className={cn("size-3.5", orders.isFetching && "animate-spin")} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            aria-label="Sair do painel"
            onClick={sair}
            className="border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
          >
            <LogOut className="size-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 py-8 md:px-8">
        <Resumo token={token} />

        <div className="mt-10 flex gap-6 overflow-x-auto border-b border-cream/10 [scrollbar-width:none]">
          {(["pedidos", "cafes", "receitas", "lifestyle", "contatos", "newsletter", "bling"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAba(t)}
              className={cn(
                "label -mb-px shrink-0 border-b-2 pb-3 whitespace-nowrap transition-colors",
                aba === t ? "border-jungle text-cream" : "border-transparent text-cream/45"
              )}
            >
              {t === "pedidos"
                ? "Pedidos"
                : t === "cafes"
                ? "Cafés"
                : t === "receitas"
                ? "Conheça o seu café"
                : t === "lifestyle"
                ? "Lifestyle"
                : t === "contatos"
                ? "Contatos & Clube"
                : t === "newsletter"
                ? "Newsletter"
                : "Bling"}
            </button>
          ))}
        </div>

        {aba === "pedidos" && (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFiltro("")}
                className={cn(
                  "label border px-3 py-2 text-[9px] transition-colors",
                  filtro === "" ? "border-jungle text-jungle" : "border-cream/20 text-cream/50"
                )}
              >
                Todos
              </button>
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFiltro(s)}
                  className={cn(
                    "label border px-3 py-2 text-[9px] transition-colors",
                    filtro === s ? "border-jungle text-jungle" : "border-cream/20 text-cream/50"
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            <div className="mt-6 border-t border-cream/10">
              {orders.isLoading && (
                <p className="px-5 py-8 text-sm text-cream/45">Carregando pedidos…</p>
              )}
              {orders.error && !orders.isLoading && (
                <p className="px-5 py-8 text-sm text-red">{orders.error.message}</p>
              )}
              {!orders.isLoading && !orders.error && lista.length === 0 && (
                <p className="px-5 py-8 text-sm text-cream/45">
                  Nenhum pedido {filtro ? "nesta etapa" : "ainda"}.
                </p>
              )}
              {lista.map((o) => <Pedido key={o.id} order={o} token={token} />)}
            </div>
          </>
        )}

        {aba === "cafes" && (
          <div className="mt-8">
            <CafesPainel token={token} />
          </div>
        )}

        {aba === "receitas" && (
          <div className="mt-8">
            <ReceitasPainel token={token} />
          </div>
        )}

        {aba === "lifestyle" && (
          <div className="mt-8">
            <LifestylePainel token={token} />
          </div>
        )}

        {aba === "contatos" && (
          <div className="mt-6 border-t border-cream/10">
            <Leads token={token} />
          </div>
        )}

        {aba === "bling" && (
          <div className="mt-8">
            <BlingPainel token={token} />
          </div>
        )}
        {aba === "newsletter" && <div className="mt-8"><NewsletterPainel token={token} /></div>}
      </main>
    </div>
  );
}
