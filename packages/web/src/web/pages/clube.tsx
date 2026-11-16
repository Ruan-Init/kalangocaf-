import { useState } from "react";
import { Check } from "lucide-react";
import { Field, Reveal, SectionLabel, Spinner } from "../components/primitives";
import { useCreateLead } from "../queries/leads";
import { brl } from "../lib/format";
import { cn } from "../lib/utils";
import { MOSAIC_TONES } from "../lib/mosaic";
import { breadcrumb, SITE_URL, useSeo } from "../lib/seo";

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
  const [plano, setPlano] = useState("duo");
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [kind, setKind] = useState<"clube" | "atacado">("clube");

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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    lead.mutate({
      kind,
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      company: form.company || undefined,
      plan: kind === "clube" ? plano : undefined,
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
              {kind === "clube" ? "Entre pra lista" : "Café pro seu balcão"}
            </h2>
            <p className="mt-6 max-w-md text-cream/60">
              {kind === "clube"
                ? "O clube abre em lotes limitados a cada temporada. Deixe seus dados e a gente te chama assim que abrir a próxima leva."
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

          {lead.isSuccess
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
                <Field label="WhatsApp" value={form.phone} onChange={set("phone")} />
                {kind === "atacado" && (
                  <Field
                    label="Empresa / CNPJ"
                    value={form.company}
                    onChange={set("company")}
                  />
                )}
                <Field
                  label={kind === "clube" ? "Moagem preferida (opcional)" : "Volume estimado por mês"}
                  value={form.message}
                  onChange={set("message")}
                />
                {lead.isError && (
                  <p className="text-sm text-jungle-lit">
                    Não conseguimos enviar agora. Tente novamente.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={lead.isPending}
                  className="label flex items-center justify-center gap-3 bg-cream px-8 py-4 text-ink transition-colors hover:bg-jungle hover:text-cream disabled:opacity-60"
                >
                  {lead.isPending && <Spinner />}
                  {kind === "clube" ? "Quero assinar" : "Falar com o comercial"}
                </button>
              </form>
            )}
        </div>
      </section>
    </>
  );
}
