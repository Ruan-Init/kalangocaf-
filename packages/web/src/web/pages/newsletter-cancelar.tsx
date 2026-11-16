import { useNewsletterSubscription, useNewsletterUnsubscribe } from "../queries/newsletter";
import { useSeo } from "../lib/seo";
import { Spinner } from "../components/primitives";

export default function NewsletterCancelar() {
  useSeo({ title: "Cancelar newsletter", description: "Gerencie sua inscrição na newsletter Kalango.", path: "/newsletter/cancelar", noindex: true });
  const token = new URLSearchParams(window.location.search).get("t") ?? "";
  const subscription = useNewsletterSubscription(token);
  const unsubscribe = useNewsletterUnsubscribe();
  const valid = /^[a-f0-9]{64}$/.test(token);
  const cancelled = unsubscribe.isSuccess || subscription.data?.subscribed === false;
  return <section className="shell min-h-[70vh] py-40"><div className="max-w-lg"><p className="label text-jungle">Newsletter Kalango</p><h1 className="display mt-6 text-5xl">{cancelled ? "Inscrição cancelada" : "Cancelar inscrição"}</h1>
    {!valid || subscription.error ? <p role="alert" className="mt-6 text-sm">Este link não é válido. Use o link de cancelamento no e-mail que recebeu.</p> : subscription.isLoading ? <p className="mt-6 flex gap-2"><Spinner />Carregando inscrição…</p> : cancelled ? <p className="mt-6 text-sm">Você não receberá novas campanhas da Kalango. E-mails sobre compras e entregas continuam sendo enviados quando necessários.</p> : <><p className="mt-6 text-sm">Quer deixar de receber novidades da torrefação? Confirme abaixo. Abrir este link não altera sua inscrição.</p><button className="label mt-8 border border-ink px-6 py-4 disabled:opacity-50" disabled={unsubscribe.isPending} onClick={() => unsubscribe.mutate({ token })}>{unsubscribe.isPending ? "Cancelando…" : "Confirmar cancelamento da newsletter"}</button></>}
    {unsubscribe.error && <p role="alert" className="mt-6 text-sm text-red">{unsubscribe.error.message}</p>}
  </div></section>;
}