/**
 * Aba "Bling" do painel /gestao: conexão, escolhas (categoria dos cafés,
 * canal e forma de pagamento), sincronização e pedidos que ainda não foram.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Link2, RefreshCw, Send, Unplug } from "lucide-react";
import { brl } from "../lib/format";
import { cn } from "../lib/utils";
import { Spinner } from "./primitives";
import {
  useBlingAuthorizeUrl,
  useBlingDisconnect,
  useBlingOptions,
  useBlingPushOrder,
  useBlingSaveSettings,
  useBlingStatus,
  useBlingSync,
} from "../queries/bling";

function dataHora(value: Date | string | number | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Copiar({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="min-w-0">
      <span className="label text-cream/45">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate border border-cream/15 bg-ink px-3 py-2 text-xs text-cream/80">
          {value}
        </code>
        <button
          type="button"
          aria-label={`Copiar ${label}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setOk(true);
            setTimeout(() => setOk(false), 1500);
          }}
          className="shrink-0 border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
        >
          {ok ? <Check className="size-3.5 text-lime" strokeWidth={2} /> : <Copy className="size-3.5" strokeWidth={1.6} />}
        </button>
      </div>
    </div>
  );
}

function Lista({ titulo, itens, tom }: { titulo: string; itens: string[]; tom?: string }) {
  if (!itens.length) return null;
  return (
    <div className="mt-3 text-sm">
      <span className={cn("text-cream/60", tom)}>
        {titulo} ({itens.length}):
      </span>{" "}
      <span className="text-cream/80">{itens.join(", ")}</span>
    </div>
  );
}

const SELECT =
  "mt-2 w-full border border-cream/20 bg-ink px-3 py-2.5 text-sm text-cream outline-none focus:border-jungle";

function Escolhas({
  token,
  settings,
}: {
  token: string;
  settings: { cafeCategoryId: number | null; lojaId: number | null; formaPagamentoId: number | null; initialDepositId: number | null };
}) {
  const qc = useQueryClient();
  const options = useBlingOptions(token, true);
  const save = useBlingSaveSettings();
  const [deposito, setDeposito] = useState(settings.initialDepositId ? String(settings.initialDepositId) : "");
  const [cat, setCat] = useState(settings.cafeCategoryId ? String(settings.cafeCategoryId) : "");
  const [loja, setLoja] = useState(settings.lojaId ? String(settings.lojaId) : "");
  const [forma, setForma] = useState(settings.formaPagamentoId ? String(settings.formaPagamentoId) : "");
  const [aviso, setAviso] = useState<string | null>(null);

  const salvar = () => {
    setAviso(null);
    save.mutate(
      {
        token,
        cafeCategoryId: cat ? Number(cat) : null,
        initialDepositId: deposito ? Number(deposito) : null,
        lojaId: loja ? Number(loja) : null,
        formaPagamentoId: forma ? Number(forma) : null,
      },
      {
        onSuccess: () => {
          setAviso("Salvo.");
          void qc.invalidateQueries({ queryKey: [["bling"]] });
        },
        onError: (e) => setAviso(e.message),
      }
    );
  };

  if (options.isLoading) return <p className="text-sm text-cream/45">Carregando listas do Bling…</p>;
  if (options.error) return <p className="text-sm text-red">{options.error.message}</p>;
  const o = options.data;
  if (!o) return null;

  return (
    <div className="grid gap-5 md:grid-cols-3">
      <label className="block">
        <span className="label text-cream/45">Categoria dos cafés</span>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={SELECT}>
          <option value="">Nenhuma (não importa cafés do ERP)</option>
          {o.categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <span className="mt-1.5 block text-xs text-cream/45">
          Produto novo nesta categoria aparece sozinho no site.
        </span>
      </label>
      <label className="block">
        <span className="label text-cream/45">Canal de venda (loja)</span>
        <select value={loja} onChange={(e) => setLoja(e.target.value)} className={SELECT}>
          <option value="">Sem canal</option>
          {o.canais.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <span className="mt-1.5 block text-xs text-cream/45">Marca os pedidos que vêm do site.</span>
      </label>
      <label className="block">
        <span className="label text-cream/45">Forma de pagamento</span>
        <select value={forma} onChange={(e) => setForma(e.target.value)} className={SELECT}>
          <option value="">Padrão do Bling</option>
          {o.formas.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        <span className="mt-1.5 block text-xs text-cream/45">Ex.: "Mercado Pago".</span>
      </label>
      <label className="block">
        <span className="label text-cream/45">Depósito do estoque inicial</span>
        <select aria-label="Depósito do estoque inicial" value={deposito} onChange={(e) => setDeposito(e.target.value)} className={SELECT}>
          <option value="">Escolha para cadastrar cafés com estoque</option>
          {settings.initialDepositId && !o.depositos.some((d) => d.id === settings.initialDepositId) &&
            <option value={settings.initialDepositId}>Depósito #{settings.initialDepositId} (já configurado)</option>}
          {o.depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <span className="mt-1.5 block text-xs text-cream/45">Novo café com estoque positivo recebe um balanço neste depósito. Lifestyle inicia com zero.</span>
        {o.depositosWarning && <span role="alert" className="mt-2 block text-xs leading-relaxed text-gold">{o.depositosWarning}</span>}
      </label>
      <div className="md:col-span-3 flex items-center gap-4">
        <button
          type="button"
          onClick={salvar}
          disabled={save.isPending}
          className="label flex items-center gap-2 border border-cream/25 px-5 py-3 text-[10px] transition-colors hover:border-jungle hover:bg-jungle hover:text-ink disabled:opacity-40"
        >
          {save.isPending ? <Spinner /> : <Check className="size-3.5" strokeWidth={1.6} />}
          Salvar escolhas
        </button>
        {aviso && <span className="text-sm text-cream/70">{aviso}</span>}
      </div>
    </div>
  );
}

export function BlingPainel({ token }: { token: string }) {
  const qc = useQueryClient();
  const status = useBlingStatus(token);
  const authorize = useBlingAuthorizeUrl();
  const disconnect = useBlingDisconnect();
  const sync = useBlingSync();
  const push = useBlingPushOrder();
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Volta do OAuth: /gestao?aba=bling&bling=conectado|erro&motivo=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("bling");
    if (!r) return;
    setRetorno(
      r === "conectado"
        ? { ok: true, texto: "Bling conectado. A primeira sincronização já começou." }
        : { ok: false, texto: p.get("motivo") || "Não foi possível conectar." }
    );
    window.history.replaceState(null, "", "/gestao?aba=bling");
  }, []);

  const refresh = () => void qc.invalidateQueries({ queryKey: [["bling"]] });

  const conectar = () => {
    setAviso(null);
    // OAuth fora do iframe da prévia; abre durante o clique para evitar bloqueio.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setAviso("Permita abrir uma nova aba neste navegador e clique em Conectar ao Bling novamente.");
      return;
    }
    popup.opener = null;
    authorize.mutate(
      { token },
      {
        onSuccess: (r) => {
          if (popup.closed) {
            setAviso("A aba de autorização foi fechada. Clique em Conectar ao Bling novamente.");
            return;
          }
          popup.location.replace(r.url);
          setAviso("Autorize sua conta na nova aba. Depois volte aqui para conferir a conexão.");
        },
        onError: (e) => { popup.close(); setAviso(e.message); },
      }
    );
  };

  const desconectar = () => {
    if (!window.confirm("Desconectar o Bling? O site para de receber estoque/preço e de enviar pedidos.")) return;
    disconnect.mutate({ token }, { onSuccess: refresh, onError: (e) => setAviso(e.message) });
  };

  const sincronizar = () => {
    setAviso(null);
    sync.mutate(
      { token },
      {
        onSuccess: (r) => {
          setAviso(
            r.summary.error
              ? `Sincronização com erro: ${r.summary.error}`
              : `Pronto: ${r.summary.updated.length} atualizado(s), ${r.summary.created.length} novo(s)` +
                  (r.ordersSent ? `, ${r.ordersSent} pedido(s) enviados.` : ".")
          );
          refresh();
          void qc.invalidateQueries({ queryKey: [["catalog"]] });
        },
        onError: (e) => setAviso(e.message),
      }
    );
  };

  const enviar = (reference: string) => {
    setAviso(null);
    push.mutate(
      { token, reference },
      {
        onSuccess: () => {
          setAviso(`Pedido ${reference} enviado ao Bling.`);
          refresh();
          void qc.invalidateQueries({ queryKey: [["admin"]] });
        },
        onError: (e) => {
          setAviso(`${reference}: ${e.message}`);
          refresh();
        },
      }
    );
  };

  if (status.isLoading) return <p className="px-5 py-8 text-sm text-cream/45">Carregando…</p>;
  if (status.error) return <p className="px-5 py-8 text-sm text-red">{status.error.message}</p>;
  const s = status.data;
  if (!s) return null;

  const last = s.lastSync;

  return (
    <div className="space-y-10">
      {retorno && (
        <p className={cn("border px-4 py-3 text-sm", retorno.ok ? "border-lime/50 text-lime" : "border-red/50 text-red")}>
          {retorno.texto}
        </p>
      )}

      {/* Conexão */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "label border px-2.5 py-1 text-[9px]",
              s.connected && !s.needsReconnect
                ? "border-lime/60 text-lime"
                : s.needsReconnect
                ? "border-gold/60 text-gold"
                : "border-cream/25 text-cream/60"
            )}
          >
            {s.connected && !s.needsReconnect ? "Conectado" : s.needsReconnect ? "Reconectar" : "Desconectado"}
          </span>
          {s.companyName && <span className="text-[15px]">{s.companyName}</span>}
          <div className="ml-auto flex gap-2">
            {s.configured && (
              <button
                type="button"
                onClick={conectar}
                disabled={authorize.isPending}
                className="label flex items-center gap-2 border border-cream/25 px-4 py-2.5 text-[10px] transition-colors hover:border-jungle hover:bg-jungle hover:text-ink disabled:opacity-40"
              >
                {authorize.isPending ? <Spinner /> : <Link2 className="size-3.5" strokeWidth={1.6} />}
                {s.connected ? "Reconectar" : "Conectar ao Bling"}
              </button>
            )}
            {s.connected && (
              <button
                type="button"
                onClick={desconectar}
                disabled={disconnect.isPending}
                className="label flex items-center gap-2 border border-cream/20 px-4 py-2.5 text-[10px] text-cream/60 transition-colors hover:border-red hover:text-red"
              >
                <Unplug className="size-3.5" strokeWidth={1.6} />
                Desconectar
              </button>
            )}
          </div>
        </div>

        {!s.configured && (
          <p className="mt-4 flex items-start gap-2 border border-gold/40 p-4 text-sm text-cream/75">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={1.6} />
            Falta o Client ID e o Client Secret do aplicativo do Bling no servidor.
          </p>
        )}
        {s.configured && !s.connected && (
          <div className="mt-4 space-y-3 border border-jungle/30 bg-jungle/5 p-4 text-sm text-cream/75">
            <p className="label text-jungle">Credenciais configuradas · falta autorizar a conta</p>
            <ol className="list-inside list-decimal space-y-2 leading-relaxed">
              <li>No aplicativo do Bling, cadastre exatamente o link de redirecionamento mostrado abaixo.</li>
              <li>Clique em “Conectar ao Bling”, entre na sua conta e autorize o aplicativo na nova aba.</li>
              <li>Quando aparecer “Conectado”, escolha a categoria dos cafés e o depósito de estoque inicial e use “Sincronizar agora”.</li>
            </ol>
          </div>
        )}
        {s.needsReconnect && (
          <p className="mt-4 flex items-start gap-2 border border-gold/40 p-4 text-sm text-cream/75">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" strokeWidth={1.6} />
            O Bling recusou a renovação do acesso (passou de 30 dias ou a autorização foi revogada). Clique em
            Reconectar.
          </p>
        )}
        {s.lastError && !s.needsReconnect && (
          <p className="mt-4 text-sm text-red">Último erro: {s.lastError}</p>
        )}

        {s.connected && (
          <div className="mt-4 grid gap-1 text-xs text-cream/50 md:grid-cols-3">
            <span>Conectado em {dataHora(s.connectedAt)}</span>
            <span>Pedidos pagos a partir de {dataHora(s.ordersSince)}</span>
            <span>Acesso renova até {dataHora(s.refreshExpiresAt)}</span>
          </div>
        )}

        <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <Copiar label="Link de redirecionamento (app no Bling)" value={s.redirectUrl} />
          <Copiar label="URL do webhook (product e stock)" value={s.webhookUrl} />
        </div>
        {aviso && <output className="mt-4 block text-sm text-cream/80">{aviso}</output>}
      </section>

      {s.connected && (
        <>
          <section>
            <h2 className="display text-3xl leading-none">Escolhas</h2>
            <div className="mt-5">
              <Escolhas key={JSON.stringify(s.settings)} token={token} settings={s.settings} />
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="display text-3xl leading-none">Sincronização</h2>
              <button
                type="button"
                onClick={sincronizar}
                disabled={sync.isPending || s.syncing}
                className="label ml-auto flex items-center gap-2 border border-cream/25 px-4 py-2.5 text-[10px] transition-colors hover:border-jungle hover:bg-jungle hover:text-ink disabled:opacity-40"
              >
                <RefreshCw className={cn("size-3.5", (sync.isPending || s.syncing) && "animate-spin")} strokeWidth={1.6} />
                Sincronizar agora
              </button>
            </div>
            <p className="mt-2 text-xs text-cream/45">
              Estoque e produto atualizam na hora pelo webhook; a sincronização completa roda sozinha a cada 6 h.
            </p>
            {last ? (
              <div className="mt-5 border border-cream/10 p-4">
                <p className="text-sm text-cream/60">
                  Última: {dataHora(last.at)} ·{" "}
                  {last.trigger === "manual" ? "manual" : last.trigger === "connect" ? "na conexão" : "automática"} ·{" "}
                  {last.checked} produto(s) do Bling conferidos
                </p>
                {last.error && <p className="mt-2 text-sm text-red">{last.error}</p>}
                <Lista titulo="Atualizados" itens={last.updated} />
                <Lista titulo="Novos no site" itens={last.created} tom="text-lime" />
                <Lista titulo="Desativados" itens={last.deactivated} tom="text-gold" />
                <Lista titulo="SKUs do site que não existem no Bling" itens={last.notFound} tom="text-red/80" />
                {!last.error &&
                  !last.updated.length &&
                  !last.created.length &&
                  !last.deactivated.length &&
                  !last.notFound.length && <p className="mt-2 text-sm text-cream/60">Nada mudou.</p>}
              </div>
            ) : (
              <p className="mt-5 text-sm text-cream/45">Ainda não sincronizou.</p>
            )}
          </section>

          <section>
            <h2 className="display text-3xl leading-none">Produtos · Cafés e Lifestyle</h2>
            <div className="mt-5 border-t border-cream/10">
              {s.products.map((p) => (
                <div key={`${p.kind}:${p.id}`} className="flex min-w-0 flex-wrap items-center gap-4 border-b border-cream/10 px-1 py-3 text-sm">
                  <span title={p.sku ?? undefined} className="w-20 shrink-0 truncate text-xs text-cream/45">{p.sku ?? "—"}</span>
                  <span className={cn("min-w-0 flex-1 truncate", !p.active && "text-cream/40 line-through")}>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-cream/70">{brl(p.priceCents)}</span>
                  <span className="w-20 shrink-0 text-right text-cream/70">{p.stock} un.</span>
                  <span
                    className={cn(
                      "label w-24 shrink-0 text-right text-[9px]",
                      p.blingId ? "text-lime" : "text-cream/35"
                    )}
                  >
                    {!["legacy", "ready"].includes(p.publicationStatus) ? "Rascunho" : p.blingId ? `Bling #${p.blingId}` : "Sem vínculo"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="display text-3xl leading-none">Pedidos pagos fora do Bling</h2>
            <p className="mt-2 text-xs text-cream/45">
              Pedidos pagos antes da conexão não vão sozinhos — envie só se quiser. Pedidos de teste nunca vão.
            </p>
            <div className="mt-5 border-t border-cream/10">
              {s.pendingOrders.length === 0 && (
                <p className="py-6 text-sm text-cream/45">Nenhum pendente.</p>
              )}
              {s.pendingOrders.map((o) => (
                <div key={o.reference} className="flex flex-wrap items-center gap-4 border-b border-cream/10 px-1 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.customerName}</span>
                    <span className="block text-xs text-cream/45">
                      {o.reference} · pago {dataHora(o.paidAt)}
                      {o.blingStatus === "sending" ? " · enviando…" : ""}
                    </span>
                    {o.blingError && <span className="block text-xs text-red">{o.blingError}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => enviar(o.reference)}
                    disabled={push.isPending}
                    className="label flex shrink-0 items-center gap-2 border border-cream/25 px-3 py-2 text-[9px] transition-colors hover:border-jungle hover:bg-jungle hover:text-ink disabled:opacity-40"
                  >
                    {push.isPending && push.variables?.reference === o.reference ? (
                      <Spinner />
                    ) : (
                      <Send className="size-3.5" strokeWidth={1.6} />
                    )}
                    Enviar ao Bling
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
