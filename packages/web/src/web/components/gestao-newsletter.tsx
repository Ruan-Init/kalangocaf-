/* Inline ARIA confirmations deliberately keep the existing layout rather than browser-native modal styling. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Mail, Plus, Send, X } from "lucide-react";
import { Spinner } from "./primitives";
import { cn } from "../lib/utils";
import { useExportNewsletter, useNewsletterCampaigns, useNewsletterRecipients, useNewsletterSubscribers, useNewsletterSummary, usePrepareCampaign, useRecoverCampaign, useRemoveNewsletterSubscriber, useRetryCampaignFailures, useSaveCampaign, useSendCampaignChunk } from "../queries/newsletter";

const field = "w-full border border-cream/20 bg-transparent px-4 py-3 text-sm text-cream outline-none focus:border-jungle disabled:opacity-50";
const button = "label inline-flex items-center justify-center gap-2 border border-cream/25 px-4 py-3 text-[10px] transition-colors hover:border-jungle hover:text-jungle disabled:opacity-40";
const STATUS: Record<string, string> = { draft: "Rascunho", preparing: "Preparando", active: "Em andamento", completed: "Finalizada", queued: "Pendente", processing: "Em envio", accepted: "Aceito pelo serviço", failed: "Recusado", uncertain: "Resultado incerto", skipped: "Não enviado / cancelado", subscribed: "Inscrito", unsubscribed: "Cancelado" };
type Campaign = NonNullable<ReturnType<typeof useNewsletterCampaigns>["data"]>[number];
type Counts = Record<string, number>;
const date = (d: Date | string | number | null) => d ? new Date(d).toLocaleString("pt-BR") : "—";

function Recipients({ token, id }: { token: string; id: number }) {
  const [page, setPage] = useState(1);
  const query = useNewsletterRecipients(token, id, page);
  return <div className="mt-4 border-t border-cream/15 pt-4">
    {query.isLoading && <p className="text-sm text-cream/50">Carregando destinatários…</p>}
    {query.error && <p role="alert" className="text-sm text-red">{query.error.message}</p>}
    <div className="space-y-2">{query.data?.rows.map((r) => <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-cream/10 py-2 text-xs">
      <span className="min-w-0 break-all">{r.email}</span><span className="text-cream/55">{STATUS[r.status] ?? r.status}</span>
      {r.error && <p className="w-full text-red/80">{r.error}</p>}
    </div>)}</div>
    {query.data && query.data.pages > 1 && <div className="mt-4 flex items-center gap-3"><button className={button} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</button><span className="text-xs">{page} / {query.data.pages}</span><button className={button} disabled={page >= query.data.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button></div>}
  </div>;
}

export function NewsletterPainel({ token }: { token: string }) {
  const summary = useNewsletterSummary(token);
  const campaigns = useNewsletterCampaigns(token);
  const [tab, setTab] = useState<"campanhas" | "inscritos">("campanhas");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "subscribed" | "unsubscribed">("all");
  const [page, setPage] = useState(1);
  const subscribers = useNewsletterSubscribers(token, search, status, page);
  const [draft, setDraft] = useState<{ id?: number; creationKey: string; subject: string; message: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState<Campaign | null>(null);
  const [confirmAudience, setConfirmAudience] = useState<number | null>(null);
  const [remove, setRemove] = useState<{ id: number; email: string } | null>(null);
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [savingAndConfirming, setSavingAndConfirming] = useState(false);
  const [progress, setProgress] = useState<Counts | null>(null);
  const running = useRef(false);
  const stop = useRef(false);
  const save = useSaveCampaign();
  const prepare = usePrepareCampaign();
  const chunk = useSendCampaignChunk();
  const recover = useRecoverCampaign();
  const retryFailed = useRetryCampaignFailures();
  const exporter = useExportNewsletter();
  const remover = useRemoveNewsletterSubscriber();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries();
  const newDraft = () => { setDraft({ creationKey: crypto.randomUUID(), subject: "", message: "" }); setNotice(null); setPreview(false); };

  async function saveDraft() {
    if (!draft) return;
    setNotice(null);
    try {
      const row = await save.mutateAsync({ token, ...draft });
      setDraft({ id: row.id, creationKey: row.creationKey, subject: row.subject, message: row.message });
      setNotice("Rascunho salvo. Nenhum e-mail enviado.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Não foi possível salvar o rascunho."); }
  }

  async function saveAndConfirm() {
    if (!draft) return;
    setNotice(null);
    setSavingAndConfirming(true);
    try {
      const row = await save.mutateAsync({ token, ...draft });
      setDraft({ id: row.id, creationKey: row.creationKey, subject: row.subject, message: row.message });
      const [campaignResult, summaryResult] = await Promise.all([
        campaigns.refetch(),
        summary.refetch(),
      ]);
      const campaign = campaignResult.data?.find((item) => item.id === row.id);
      if (!campaign) throw new Error("Rascunho salvo, mas não foi possível abrir a confirmação. Atualize a lista de campanhas.");
      const active = summaryResult.data?.active ?? 0;
      if (!summaryResult.data?.configuration.ready || active === 0) {
        setNotice("Rascunho salvo. Configure o serviço de e-mail e tenha inscritos ativos para enviar.");
        return;
      }
      setConfirm(campaign);
      setConfirmAudience(active);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Não foi possível salvar e preparar o envio.");
    } finally {
      setSavingAndConfirming(false);
    }
  }

  function requestConfirmation(campaign: Campaign) {
    setConfirm(campaign);
    setConfirmAudience(summary.data?.active ?? 0);
  }

  async function runCampaign(c: Campaign, retry = false, expectedCount?: number) {
    if (running.current) return;
    running.current = true; stop.current = false; setSending(true); setNotice(null); setConfirm(null); setConfirmAudience(null); setProgress(null);
    try {
      if (c.status === "draft") {
        await prepare.mutateAsync({ token, id: c.id, expectedCount: expectedCount ?? summary.data?.active ?? 0, expectedSubject: c.subject, expectedMessage: c.message });
      } else {
        await recover.mutateAsync({ token, id: c.id });
        if (retry) await retryFailed.mutateAsync({ token, id: c.id });
      }
      // Lotes de no máximo 50. Se a aba fechar, pendentes podem ser retomados pelo histórico.
      while (!stop.current) {
        const result = await chunk.mutateAsync({ token, id: c.id });
        setProgress(result.counts);
        refresh();
        if (result.error) { setNotice(result.error); break; }
        if (!result.counts.queued && !result.counts.processing) {
          setNotice(`Campanha finalizada: ${result.counts.accepted} mensagem(ns) aceita(s) pelo serviço. Confira recusas e cancelamentos no histórico.`); break;
        }
      }
      if (stop.current) setNotice("Envio pausado após o lote atual. Retome os restantes pelo histórico.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Envio interrompido. Consulte o histórico antes de retomar."); }
    finally { setSending(false); running.current = false; refresh(); }
  }

  async function exportCsv() {
    setNotice(null);
    try {
      const data = await exporter.mutateAsync({ token, search, status });
      const url = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = data.filename; a.click(); URL.revokeObjectURL(url);
      setNotice(`${data.count} inscrito(s) exportado(s).`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Falha na exportação."); }
  }

  return <section aria-label="Newsletter na Gestão" className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="label text-jungle">Comunicação Kalango</p><h2 className="display mt-3 text-4xl">Newsletter</h2><p className="mt-3 max-w-xl text-sm text-cream/55">Escreva e envie e-mails para quem pediu notícias da torrefação. Compradores não entram nesta lista automaticamente.</p></div>
      <button className={button} onClick={newDraft} disabled={sending}><Plus className="size-4" />Nova campanha</button>
    </div>
    {summary.isLoading ? <p className="text-sm text-cream/50">Carregando newsletter…</p> : summary.error ? <p role="alert" className="text-sm text-red">{summary.error.message}</p> : summary.data && <>
      <div className="grid gap-px bg-cream/10 sm:grid-cols-3">{[["Inscritos ativos", summary.data.active], ["Cancelamentos", summary.data.unsubscribed], ["Total de contatos", summary.data.total]].map(([label, value]) => <div key={String(label)} className="bg-ink p-5"><p className="label text-cream/45">{label}</p><p className="display mt-3 text-3xl">{value}</p></div>)}</div>
      <div className={cn("border p-4 text-sm", summary.data.configuration.ready ? "border-jungle/40" : "border-gold/40")}><p className="flex items-center gap-2 font-medium"><Mail className="size-4" />{summary.data.configuration.ready ? "Serviço de envio configurado" : "Envio de e-mail ainda não configurado"}</p><p className="mt-2 text-cream/55">{summary.data.configuration.note}</p><p className="mt-2 break-all text-xs text-cream/50">Remetente: {summary.data.configuration.from}</p></div>
    </>}
    {notice && <p role="status" className="border border-cream/20 p-4 text-sm">{notice}</p>}
    {sending && <div className="flex flex-wrap items-center gap-3 border border-jungle/40 p-4 text-sm"><Spinner /><span>Enviando campanha{progress ? `: ${progress.accepted} aceitos, ${progress.queued} pendentes` : "…"}</span><button className={button} onClick={() => { stop.current = true; }}>Pausar após este lote</button><p className="w-full text-xs text-cream/50">Mantenha esta aba aberta. Fechá-la não repete os envios; o restante fica no histórico.</p></div>}

    {draft && <div className="border border-cream/20 p-5 md:p-7"><div className="flex items-center justify-between"><h3 className="display text-2xl">{draft.id ? "Editar rascunho" : "Nova campanha"}</h3><button aria-label="Fechar editor" disabled={sending || save.isPending} onClick={() => setDraft(null)}><X className="size-5" /></button></div>
      <div className="mt-6 grid gap-5"><label className="block"><span className="label mb-2 block text-cream/50">Assunto do e-mail</span><input aria-label="Assunto do e-mail" maxLength={150} className={field} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} disabled={save.isPending || sending} placeholder="Um novo microlote acabou de sair da torrefação" /></label>
      <label className="block"><span className="label mb-2 block text-cream/50">Mensagem</span><textarea aria-label="Mensagem da newsletter" rows={9} maxLength={12000} className={field} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} disabled={save.isPending || sending} placeholder="Conte a novidade. Escreva em texto; a identidade Kalango e o link de cancelamento entram automaticamente." /></label></div>
      <div className="mt-5 flex flex-wrap gap-3"><button className={button} onClick={() => setPreview((p) => !p)}><Eye className="size-4" />{preview ? "Ocultar prévia" : "Ver prévia"}</button><button className={button} disabled={save.isPending || savingAndConfirming || sending || draft.subject.trim().length < 3 || draft.message.trim().length < 10} onClick={saveDraft}>{save.isPending ? <Spinner /> : <CheckIcon />}Salvar rascunho</button><button className={button} disabled={save.isPending || savingAndConfirming || sending || draft.subject.trim().length < 3 || draft.message.trim().length < 10 || !summary.data?.configuration.ready || !summary.data.active} onClick={() => void saveAndConfirm()}>{savingAndConfirming ? <Spinner /> : <Send className="size-4" />}Salvar e enviar</button></div>
      {preview && <div className="mt-6 max-w-xl bg-cream p-7 text-ink"><p className="label text-jungle">Kalango Cafés Especiais</p><h4 className="mt-6 break-words font-serif text-3xl">{draft.subject || "Assunto do e-mail"}</h4><p className="mt-6 whitespace-pre-wrap break-words text-sm leading-7">{draft.message || "Sua mensagem aparece aqui."}</p><p className="mt-7 border-t border-ink/15 pt-4 text-xs text-muted">Você recebe esta mensagem porque se inscreveu na newsletter da Kalango.<br /><span className="underline">Cancelar inscrição</span> · Fale com a Kalango</p></div>}
      <p className="mt-5 text-xs text-cream/45">“Salvar e enviar” abre a confirmação com o total de inscritos; nenhum e-mail é enviado antes de você confirmar.</p>
    </div>}

    <div className="flex gap-4 border-b border-cream/15">{(["campanhas", "inscritos"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("label border-b-2 pb-3", tab === t ? "border-jungle text-cream" : "border-transparent text-cream/45")}>{t === "campanhas" ? "Campanhas & histórico" : "Inscritos"}</button>)}</div>
    {tab === "campanhas" && <div className="space-y-4">
      {campaigns.isLoading && <p className="text-sm text-cream/50">Carregando campanhas…</p>}{campaigns.error && <p role="alert" className="text-sm text-red">{campaigns.error.message}</p>}
      {!campaigns.isLoading && !campaigns.error && !campaigns.data?.length && <p className="py-8 text-sm text-cream/50">Nenhuma campanha ainda. Crie um rascunho para começar.</p>}
      {campaigns.data?.map((c) => <article key={c.id} className="border border-cream/15 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="label text-jungle">{STATUS[c.status]} · #{c.id}</p><h3 className="mt-3 break-words text-lg">{c.subject}</h3><p className="mt-2 text-xs text-cream/40">Criada em {date(c.createdAt)}</p></div><span className="text-xs text-cream/50">{c.counts.total} destinatário(s)</span></div>
        {c.status !== "draft" && <p className="mt-4 text-xs leading-6 text-cream/60">{c.counts.accepted} aceitos · {c.counts.queued} pendentes · {c.counts.failed} recusados · {c.counts.uncertain} incertos · {c.counts.skipped} não enviados</p>}
        {c.counts.uncertain > 0 && <p className="mt-3 text-xs text-gold">Envios incertos não são repetidos. Confira esses destinatários no painel Resend antes de qualquer novo envio.</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          {c.status === "draft" && <><button className={button} disabled={sending} onClick={() => { setDraft({ id: c.id, creationKey: c.creationKey, subject: c.subject, message: c.message }); setPreview(false); }}>Editar rascunho</button><button className={button} disabled={sending || !summary.data?.configuration.ready || !summary.data?.active} onClick={() => requestConfirmation(c)}><Send className="size-3.5" />Enviar campanha</button></>}
          {c.status === "active" && <button className={button} disabled={sending || !summary.data?.configuration.ready} onClick={() => setConfirm(c)}>Retomar restantes</button>}
          {c.counts.failed > 0 && <button className={button} disabled={sending || !summary.data?.configuration.ready} onClick={() => { if (window.confirm(`Tentar novamente somente ${c.counts.failed} mensagem(ns) explicitamente recusada(s)? Aceitos e incertos não serão reenviados.`)) void runCampaign(c, true); }}>Tentar recusados novamente</button>}
          {c.status !== "draft" && <button className={button} onClick={() => setOpenHistory((id) => id === c.id ? null : c.id)}>{openHistory === c.id ? "Fechar destinatários" : "Ver destinatários"}</button>}
        </div>{openHistory === c.id && <Recipients token={token} id={c.id} />}
      </article>)}
    </div>}

    {confirm && <div role="dialog" aria-label="Confirmar envio da campanha" className="border border-gold/50 bg-gold/5 p-6"><h3 className="display text-2xl">Confirmar envio</h3><p className="mt-4 text-sm">Assunto: <strong>{confirm.subject}</strong></p><p className="mt-2 text-sm">{confirm.status === "draft" ? `${confirmAudience ?? summary.data?.active ?? 0} inscrito(s) ativo(s) vão receber este e-mail.` : `${confirm.counts.queued} destinatário(s) ainda pendente(s). Aceitos e incertos não serão repetidos.`}</p><p className="mt-3 text-xs text-cream/55">O envio real não pode ser desfeito. Cancelamentos de inscrição são respeitados.</p><div className="mt-5 flex flex-wrap gap-3"><button className={button} onClick={() => { setConfirm(null); setConfirmAudience(null); }}>Cancelar</button><button className={button} disabled={sending} onClick={() => void runCampaign(confirm, false, confirmAudience ?? undefined)}><Send className="size-4" />Confirmar e enviar</button></div></div>}

    {tab === "inscritos" && <div>
      <div className="flex flex-wrap gap-3"><input aria-label="Buscar inscritos" placeholder="Buscar nome ou e-mail" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={cn(field, "min-w-0 flex-1")} /><select aria-label="Filtrar inscrições" className={cn(field, "w-auto bg-ink")} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}><option value="all">Todos</option><option value="subscribed">Inscritos ativos</option><option value="unsubscribed">Cancelados</option></select><button className={button} disabled={exporter.isPending} onClick={exportCsv}>{exporter.isPending ? <Spinner /> : <Download className="size-4" />}Exportar CSV</button></div>
      {subscribers.isLoading && <p className="py-6 text-sm text-cream/50">Carregando inscritos…</p>}{subscribers.error && <p role="alert" className="py-6 text-sm text-red">{subscribers.error.message}</p>}
      <div className="mt-5 space-y-3">{subscribers.data?.rows.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-cream/10 py-4"><div className="min-w-0"><p className="break-words text-sm">{r.name}</p><p className="mt-1 break-all text-xs text-cream/60">{r.email}</p><p className="mt-2 text-xs text-cream/35">{STATUS[r.status]} · {date(r.unsubscribedAt ?? r.subscribedAt)}</p></div>{r.status === "subscribed" && <button className={button} disabled={remover.isPending || sending} onClick={() => setRemove({ id: r.id, email: r.email })}>Cancelar inscrição</button>}</div>)}</div>
      {!subscribers.isLoading && !subscribers.error && !subscribers.data?.rows.length && <p className="py-8 text-sm text-cream/50">Nenhum inscrito encontrado.</p>}
      {subscribers.data && <div className="mt-5 flex flex-wrap items-center gap-3 text-xs"><span>{subscribers.data.total} resultado(s)</span><button className={button} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button><span>{page} / {subscribers.data.pages}</span><button className={button} disabled={page >= subscribers.data.pages} onClick={() => setPage((p) => p + 1)}>Próxima</button></div>}
      {remove && <div role="dialog" aria-label="Confirmar cancelamento de inscrição" className="mt-5 border border-red/40 p-5"><p className="break-all text-sm">Cancelar a inscrição de {remove.email}? O histórico será preservado.</p><div className="mt-4 flex gap-3"><button className={button} disabled={remover.isPending} onClick={() => setRemove(null)}>Voltar</button><button className={button} disabled={remover.isPending} onClick={async () => { try { await remover.mutateAsync({ token, id: remove.id }); setRemove(null); setNotice("Inscrição cancelada."); } catch (e) { setNotice(e instanceof Error ? e.message : "Falha ao cancelar."); } }}>{remover.isPending ? <Spinner /> : "Confirmar cancelamento"}</button></div></div>}
    </div>}
  </section>;
}

function CheckIcon() { return <Mail className="size-4" />; }