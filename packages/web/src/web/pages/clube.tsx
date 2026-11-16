import { useState } from "react";
import { Check } from "lucide-react";
import { Field, Reveal, SectionLabel, Spinner } from "../components/primitives";
import { useCreateClubSubscription, useCreateLead } from "../queries/leads";
import { brl, maskCep, maskCpf, maskPhone, onlyDigits } from "../lib/format";
import { cn } from "../lib/utils";
import { MOSAIC_TONES } from "../lib/mosaic";
import { breadcrumb, SITE_URL, useSeo } from "../lib/seo";
import { idempotencyKeyFor, isMercadoPagoUrl } from "../lib/order-access";
import { usePaymentConfig } from "../queries/orders";

/** Escada de planos pintada com o mosaico da logo: verde → amarelo → vermelho. */
const TONE_DESCOBERTA = MOSAIC_TONES[0];
const TONE_DUO = MOSAIC_TONES[2];
const TONE_OBSESSAO = MOSAIC_TONES[4];

const PLANOS = [
  {
    id: "descoberta",
    nome: "Descoberta",
    cents: 7900,
    cadencia: "por mês",
    resumo: "1 microlote de 250g por mês, escolhido pela nossa curadoria da temporada.",
    itens: ["1 pacote 250g", "Ficha sensorial impressa", "Moagem sob medida", "Frete incluso"],
    tone: TONE_DESCOBERTA,
  },
  {
    id: "duo",
    nome: "Duo",
    cents: 14900,
    cadencia: "por mês",
    resumo: "Dois cafés contrastantes por mês — um clássico e um experimental.",
    itens: [
      "2 pacotes 250g",
      "Curadoria contrastante",
      "10% off em compras avulsas",
      "Frete incluso",
    ],
    destaque: true,
    tone: TONE_DUO,
  },
  {
    id: "obsessao",
    nome: "Obsessão",
    cents: 25900,
    cadencia: "por mês",
    resumo: "Três microlotes, incluindo lotes de fermentação limitada fora do catálogo.",
    itens: [
      "3 pacotes 250g",
      "Acesso a lotes exclusivos",
      "15% off em compras avulsas",
      "Frete incluso",
    ],
    tone: TONE_OBSESSAO,
  },
];

export default function Clube() {
  const lead = useCreateLead();
  const subscription = useCreateClubSubscription();
  const payment = usePaymentConfig();
  const [plano, setPlano] = useState("duo");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    document: "",
    zip: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    company: "",
    message: "",
  });
  const [kind, setKind] = useState<"clube" | "atacado">("clube");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [authorizeCard, setAuthorizeCard] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const paymentOff = payment.isError || payment.data?.env === "disabled";
  const returnedFromCard = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).get("retorno") === "cartao";

  useSeo({
    title: "Clube de assinatura & atacado",
    description:
      "Receba microlotes da Kalango todo mês, sem fidelidade, com frete incluso. Planos a partir de R$ 79/mês e condições especiais de atacado para cafeterias.",
    path: "/clube",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        "@id": `${SITE_URL}/clube#assinatura`,
        name: "Clube de assinatura Kalango",
        serviceType: "Assinatura mensal de café especial",
        provider: { "@id": `${SITE_URL}/#organizacao` },
        areaServed: { "@type": "Country", name: "Brasil" },
        offers: PLANOS.map((plano) => ({
          "@type": "Offer",
          name: plano.nome,
          priceCurrency: "BRL",
          price: (plano.cents / 100).toFixed(2),
          category: "Assinatura mensal",
        })),
      },
      breadcrumb([{ name: "Início", path: "/" }, { name: "Clube & Atacado", path: "/clube" }]),
    ],
  });

  const set = (k: keyof typeof form, mask?: (v: string) => string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = mask ? mask(e.target.value) : e.target.value;
      setForm((f) => ({ ...f, [k]: value }));
    };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "clube") {
      setSubmitError(null);
      const payload = {
        plan: plano as "descoberta" | "duo" | "obsessao",
        name: form.name,
        email: form.email,
        paymentMethod,
        cardConsent: paymentMethod === "card" && authorizeCard,
        newsletterOptIn,
        phone: onlyDigits(form.phone),
        document: onlyDigits(form.document),
        zip: onlyDigits(form.zip),
        street: form.street,
        number: form.number,
        complement: form.complement || undefined,
        district: form.district,
        city: form.city,
        state: form.state.toUpperCase(),
      };
      try {
        const result = await subscription.mutateAsync({
          ...payload,
          idempotencyKey: idempotencyKeyFor(payload),
        });
        if (result.paymentMethod === "card") {
          if (!isMercadoPagoUrl(result.checkoutUrl)) {
            throw new Error("O Mercado Pago devolveu um link de cartão inválido.");
          }
          window.location.assign(result.checkoutUrl);
        }
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Não conseguimos iniciar a assinatura.");
      }
      return;
    }
    lead.mutate({
      kind,
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      company: form.company || undefined,
      message: form.message || undefined,
    });
  }

  return (
    <>
      <section className="grain relative overflow-hidden bg-ink pt-40 pb-20 text-cream md:pt-48">
        <div className="absolute top-10 -left-20 size-[460px] rounded-full bg-jungle/20 blur-[150px]" />
        <div className="shell relative">
          <SectionLabel className="text-cream/70" index="03">Clube & Atacado</SectionLabel>
          <h1 className="display mt-8 text-[12vw] leading-[0.86] md:text-[10.5vw]">
            Café novo<br />
            <span className="text-transparent [-webkit-text-stroke:1.5px_#EFE9D0]">todo mês</span>
          </h1>
          <p className="mt-10 max-w-xl text-cream/70">
            A gente torra, escolhe e manda. Você só decide a moagem. Assinatura sem fidelidade —
            pausa, troca ou cancela quando quiser.
          </p>
        </div>
      </section>

      <section className="shell py-20 md:py-28">
        <div className="grid gap-6 md:grid-cols-3">
          {PLANOS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.08}>
              <button
                type="button"
                onClick={() => {
                  setKind("clube");
                  setPlano(p.id);
                  setAuthorizeCard(false);
                  setSubmitError(null);
                  subscription.reset();
                  setCopied(false);
                }}
                className={cn(
                  "flex h-full w-full flex-col border p-8 text-left transition-colors",
                  plano === p.id && kind === "clube"
                    ? cn("bg-ink text-cream", p.tone.border)
                    : "border-ink/15 hover:border-ink",
                  p.destaque && "md:-translate-y-6"
                )}
              >
                {p.destaque && (
                  <span className={cn("label mb-4 w-fit px-3 py-1", p.tone.solid)}>
                    Mais assinado
                  </span>
                )}
                <h2 className="display text-4xl">{p.nome}</h2>
                <p
                  className={cn(
                    "mt-3 text-sm",
                    plano === p.id && kind === "clube" ? "text-cream/70" : "text-muted"
                  )}
                >
                  {p.resumo}
                </p>
                <p className="display mt-8 text-5xl">{brl(p.cents)}</p>
                <p className="label mt-2 text-muted">{p.cadencia}</p>
                <ul className="mt-8 space-y-3 text-sm">
                  {p.itens.map((it) => (
                    <li key={it} className="flex items-start gap-3">
                      <Check
                        className={cn("mt-0.5 size-4 shrink-0", p.tone.text)}
                        strokeWidth={2}
                      />
                      {it}
                    </li>
                  ))}
                </ul>
                <span
                  className={cn(
                    "label mt-10 block border px-6 py-3.5 text-center transition-colors",
                    plano === p.id && kind === "clube" ? p.tone.solid : "border-ink"
                  )}
                >
                  {plano === p.id && kind === "clube" ? "Plano selecionado" : "Selecionar plano"}
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="grain relative overflow-hidden bg-ink-soft py-20 text-cream md:py-28">
        <div className="shell relative grid gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <SectionLabel className="text-cream/70" index="—">
              {kind === "clube" ? "Assinar o clube" : "Atacado & cafeterias"}
            </SectionLabel>
            <h2 className="display mt-6 text-6xl leading-[0.85] md:text-7xl">
              {kind === "clube" ? "Assine seu plano" : "Café pro seu balcão"}
            </h2>
            <p className="mt-6 max-w-md text-cream/60">
              {kind === "clube"
                ? paymentMethod === "pix"
                  ? "Escolha seu plano e receba o Pix da primeira mensalidade por e-mail. A assinatura começa após a confirmação do pagamento."
                  : "Cadastre o cartão com segurança no Mercado Pago e autorize as cobranças mensais. A assinatura fica ativa após a confirmação do primeiro pagamento."
                : "Cafeterias, restaurantes e escritórios: torra dedicada, tabela de atacado, treinamento de extração e entrega programada."}
            </p>

            <div className="mt-10 flex gap-2">
              {(["clube", "atacado"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "label border px-5 py-3 transition-colors",
                    kind === k
                      ? "border-jungle bg-jungle text-cream"
                      : "border-cream/25 text-cream/70 hover:border-cream"
                  )}
                >
                  {k === "clube" ? "Sou pessoa física" : "Sou empresa"}
                </button>
              ))}
            </div>
          </div>

          {kind === "clube" && subscription.data
                && subscription.data.paymentMethod === "pix"
            ? (
              <div className="flex flex-col items-start justify-center gap-5 border border-ink-line p-8 md:p-10">
                <p className="display text-4xl">
                  {subscription.data.paymentStatus === "approved" ? "Pagamento confirmado" : "Seu Pix está pronto"}
                </p>
                <p className="text-cream/70">
                  Plano {subscription.data.plan} · {brl(subscription.data.amountCents)}.{" "}
                  {subscription.data.paymentStatus === "approved"
                    ? "Sua assinatura está ativa."
                    : `Pague até ${new Date(String(subscription.data.expiresAt)).toLocaleString("pt-BR")}.`}
                </p>
                {subscription.data.paymentStatus !== "approved" && (
                  <>
                    <img
                      src={`data:image/png;base64,${subscription.data.pixQrCodeBase64}`}
                      alt="QR Code Pix da assinatura"
                      className="size-52 bg-white p-2"
                    />
                    <label className="w-full">
                      <span className="label text-cream/60">Pix copia e cola</span>
                      <textarea
                        readOnly
                        value={subscription.data.pixCode}
                        rows={4}
                        className="mt-2 w-full resize-y border border-cream/20 bg-ink p-3 text-xs text-cream"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(subscription.data!.pixCode);
                        setCopied(true);
                      }}
                      className="label border border-cream px-6 py-3 hover:bg-cream hover:text-ink"
                    >
                      {copied ? "Código copiado" : "Copiar código Pix"}
                    </button>
                  </>
                )}
                <p className="text-sm text-cream/60">
                  {subscription.data.paymentStatus === "approved"
                    ? "A confirmação do pagamento foi recebida."
                    : subscription.data.emailSent
                    ? `Também enviamos o código para ${form.email}.`
                    : `O e-mail não foi confirmado. Copie o código acima e fale com a gente se precisar recebê-lo novamente.`}
                </p>
              </div>
            )
            : kind === "atacado" && lead.isSuccess
            ? (
              <div className="flex flex-col items-start justify-center border border-ink-line p-10">
                <p className="display text-5xl">Recebido</p>
                <p className="mt-4 max-w-sm text-cream/60">
                  Obrigado, {form.name.split(" ")[0]}. Respondemos em até 1 dia útil no e-mail{" "}
                  {form.email}.
                </p>
              </div>
            )
            : (
              <form onSubmit={submit} className="grid gap-7 border border-ink-line p-8 md:p-10">
                <Field label="Nome" required value={form.name} onChange={set("name")} />
                <Field
                  label="E-mail"
                  type="email"
                  required
                  value={form.email}
                  onChange={set("email")}
                />
                {kind === "clube" && (
                  <label className="flex items-start gap-3 text-sm text-cream/65">
                    <input
                      type="checkbox"
                      checked={newsletterOptIn}
                      onChange={(e) => setNewsletterOptIn(e.target.checked)}
                      className="mt-1 accent-jungle"
                    />
                    <span>
                      Quero receber novidades, ofertas e notificações da Kalango por e-mail. Posso cancelar a inscrição quando quiser.
                    </span>
                  </label>
                )}
                <Field label="WhatsApp" required={kind === "clube"} value={form.phone} onChange={set("phone", maskPhone)} />
                {kind === "clube" ? (
                  <>
                    <fieldset className="space-y-3">
                      <legend className="label text-cream/60">Forma de pagamento mensal</legend>
                      <div className="flex flex-wrap gap-2">
                        {(["pix", "card"] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            aria-pressed={paymentMethod === method}
                            onClick={() => {
                              setPaymentMethod(method);
                              setAuthorizeCard(false);
                              subscription.reset();
                            }}
                            className={cn(
                              "label border px-5 py-3 transition-colors",
                              paymentMethod === method
                                ? "border-jungle bg-jungle text-cream"
                                : "border-cream/25 text-cream/70 hover:border-cream"
                            )}
                          >
                            {method === "pix" ? "Pix mensal" : "Cartão mensal"}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <Field
                      label="CPF do pagador"
                      required
                      inputMode="numeric"
                      autoComplete="off"
                      value={form.document}
                      onChange={set("document", maskCpf)}
                    />
                    <div className="grid gap-7 md:grid-cols-2">
                      <Field
                        label="CEP de entrega"
                        required
                        inputMode="numeric"
                        autoComplete="postal-code"
                        value={form.zip}
                        onChange={set("zip", maskCep)}
                      />
                      <Field label="Estado (UF)" required maxLength={2} value={form.state} onChange={set("state")} />
                      <Field label="Rua / avenida" required autoComplete="street-address" value={form.street} onChange={set("street")} />
                      <Field label="Número" required value={form.number} onChange={set("number")} />
                      <Field label="Complemento" value={form.complement} onChange={set("complement")} />
                      <Field label="Bairro" required value={form.district} onChange={set("district")} />
                      <Field label="Cidade" required value={form.city} onChange={set("city")} />
                    </div>
                    {paymentMethod === "pix" ? (
                      <p className="text-sm text-cream/55">
                        Você recebe o Pix da primeira mensalidade por e-mail. As próximas mensalidades Pix precisam de um novo pagamento.
                      </p>
                    ) : (
                      <label className="flex items-start gap-3 text-sm text-cream/65">
                        <input
                          type="checkbox"
                          required
                          checked={authorizeCard}
                          onChange={(e) => setAuthorizeCard(e.target.checked)}
                          className="mt-1 accent-jungle"
                        />
                        <span>
                          Autorizo o Mercado Pago a cobrar {brl(PLANOS.find((p) => p.id === plano)!.cents)} por mês no cartão que vou cadastrar. O cartão é cadastrado no ambiente seguro do Mercado Pago, não neste site.
                        </span>
                      </label>
                    )}
                    {paymentOff && (
                      <p className="text-sm text-gold">
                        Pagamento indisponível agora. Tente novamente mais tarde ou fale com a gente pelo WhatsApp.
                      </p>
                    )}
                    {returnedFromCard && (
                      <p role="status" className="border border-jungle/40 p-4 text-sm text-cream/70">
                        Voltou do Mercado Pago? Estamos aguardando a confirmação da assinatura. Enviaremos uma atualização por e-mail.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <Field label="Empresa / CNPJ" value={form.company} onChange={set("company")} />
                    <Field label="Volume estimado por mês" value={form.message} onChange={set("message")} />
                  </>
                )}
                {(lead.isError || subscription.isError || submitError) && (
                  <p className="text-sm text-jungle-lit">
                    {submitError ?? (subscription.error instanceof Error
                      ? subscription.error.message
                      : lead.error instanceof Error
                      ? lead.error.message
                      : "Não conseguimos enviar agora. Tente novamente.")}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={lead.isPending || subscription.isPending || (kind === "clube" && paymentOff)}
                  className="label flex items-center justify-center gap-3 bg-cream px-8 py-4 text-ink transition-colors hover:bg-jungle hover:text-cream disabled:opacity-60"
                >
                  {(lead.isPending || subscription.isPending) && <Spinner />}
                  {kind === "clube"
                    ? paymentMethod === "pix"
                      ? "Gerar Pix e assinar"
                      : "Cadastrar cartão no Mercado Pago"
                    : "Falar com o comercial"}
                </button>
              </form>
            )}
        </div>
      </section>
    </>
  );
}
