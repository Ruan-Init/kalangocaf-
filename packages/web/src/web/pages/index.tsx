import { motion } from "motion/react";
import { Link } from "wouter";
import { useProducts } from "../queries/catalog";
import { ReelEmbed } from "../components/reel";
import { HeroCarousel } from "../components/hero-carousel";
import { VideoPlayer } from "../components/video-player";
import { FeaturedCarousel } from "../components/featured-carousel";
import { useRecipes } from "../queries/recipes";
import { useCreateLead } from "../queries/leads";
import { ProductCard } from "../components/product-card";
import { ArrowCircle, ProductSkeleton, Reveal, SectionLabel, Spinner } from "../components/primitives";
import { useState } from "react";
import { SITE_URL, useSeo } from "../lib/seo";

const HERO_WORDS = ["CAFÉS", "ESPECIAIS"];

function Hero() {
  return (
    <section className="grain relative flex min-h-[100svh] items-end overflow-hidden bg-ink pt-32 pb-14 text-cream">
      <HeroCarousel />

      <div className="shell relative w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionLabel className="text-cream/70" index="01">
            Torrefação de microlotes do Cerrado
          </SectionLabel>
        </motion.div>

        <h1 className="mt-8">
          {HERO_WORDS.map((word, i) => (
            <span key={word} className="block overflow-hidden">
              <motion.span
                initial={{ y: "108%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1, delay: 0.12 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="display block text-[13vw] leading-[0.88] md:text-[11vw] lg:text-[10.5vw]"
              >
                {i === 1
                  ? (
                    <span className="text-transparent [-webkit-text-stroke:1.5px_#EFE9D0]">
                      {word}
                    </span>
                  )
                  : word}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex flex-col gap-8 border-t border-ink-line pt-8 md:flex-row md:items-end md:justify-between"
        >
          <p className="max-w-md text-[15px] text-cream/70">
            Cada lote nasce de um produtor com nome e sobrenome, passa por fermentação controlada e
            recebe uma curva de torra própria. Nada de café genérico.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/loja"
              className="group label flex items-center gap-4 bg-cream py-4 pr-4 pl-7 text-ink transition-colors hover:bg-jungle hover:text-cream"
            >
              Comprar cafés
              <ArrowCircle size="sm" className="border-ink/30 group-hover:border-cream" />
            </Link>
            <Link
              to="/clube"
              className="label border border-cream/30 px-7 py-4 transition-colors hover:border-jungle hover:text-jungle"
            >
              Clube de assinatura
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Marquee() {
  const items = [
    "MICROLOTES RASTREADOS",
    "TORRA SOB MEDIDA",
    "FERMENTAÇÃO CONTROLADA",
    "SCA 84+",
    "ENVIO PARA TODO O BRASIL",
  ];
  return (
    <div className="overflow-hidden border-y border-ink/10 bg-cream py-5">
      <div className="marquee-track">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0">
            {items.map((t) => (
              <span key={t} className="label flex items-center gap-8 px-8 text-ink/70">
                {t}
                <span className="size-1.5 rounded-full bg-jungle" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Selection() {
  const products = useProducts();
  const list = (products.data ?? []).slice(0, 6);

  return (
    <section className="shell py-24 md:py-36">
      <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div>
          <SectionLabel index="02">Seleção da temporada</SectionLabel>
          <h2 className="display mt-6 text-[10vw] leading-[0.88] md:text-[6.5vw]">
            Cafés<br />
            <span className="text-jungle">selecionados</span>
          </h2>
        </div>
        <p className="max-w-xs text-sm text-muted">
          Dez microlotes torrados em pequenas quantidades. Cada rótulo traz variedade, altitude,
          processo e produtor.
        </p>
      </div>

      <div className="mt-16 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
        {products.isLoading
          && Array.from({ length: 6 }).map((_, i) => <ProductSkeleton key={i} />)}
        {products.isError && (
          <p className="text-sm text-muted">Não foi possível carregar o catálogo agora.</p>
        )}
        {list.map((p, i) => (
          <Reveal key={p.id} delay={(i % 3) * 0.08} className={i % 3 === 1 ? "lg:mt-16" : ""}>
            <ProductCard product={p} />
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-16 flex justify-center">
        <Link
          to="/loja"
          className="group label flex items-center gap-4 border border-ink px-8 py-4 transition-colors hover:bg-ink hover:text-cream"
        >
          Ver os 10 cafés
          <ArrowCircle size="sm" />
        </Link>
      </Reveal>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="shell relative py-24 md:py-36">
      <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <SectionLabel index="04">O que a gente defende</SectionLabel>
          <ul className="mt-10 space-y-px">
            {[
              "Rastreabilidade total",
              "Colheita seletiva",
              "Fermentação controlada",
              "Torra por lote",
            ].map((item) => (
              <li key={item} className="label border-t border-ink/15 py-4 text-ink/70">
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="text-2xl leading-[1.35] md:text-[34px]">
            A Kalango existe para provar que café brasileiro não precisa ser commodity. Trabalhamos
            com <em className="text-jungle not-italic">microlotes</em> de produtores que conhecemos
            pelo nome, torramos em pequenas quantidades e ajustamos a curva até a xícara mostrar
            exatamente o que o campo entregou.
          </p>
          <Link
            to="/sobre"
            className="group label mt-10 inline-flex items-center gap-4 text-ink hover:text-jungle"
          >
            Conheça a torrefação
            <ArrowCircle size="sm" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

const PACOTE_SPECS = [
  { k: "Peso líq.", v: "250 g" },
  { k: "Torra", v: "Da semana" },
  { k: "Moagem", v: "Sua escolha" },
  { k: "Origem", v: "Rastreada" },
];

function Pacote() {
  return (
    <section className="grain relative overflow-hidden bg-ink-soft text-cream">
      <div
        className="pattern-graos pointer-events-none absolute inset-0 opacity-[0.075]"
        aria-hidden="true"
      />
      <div className="shell relative grid items-center gap-14 py-24 md:grid-cols-12 md:py-32">
        <Reveal className="md:col-span-5">
          <SectionLabel index="05">O pacote</SectionLabel>
          <h2 className="display mt-6 text-[13vw] leading-[0.82] md:text-[4.6vw]">
            Do pé<br />
            <span className="text-jungle">pra sua</span><br />
            xícara
          </h2>
          <p className="mt-8 max-w-md text-cream-dim leading-relaxed">
            O lagarto colorido na frente do pacote é o kalango — bicho teimoso do cerrado, que
            aguenta sol e não sai do lugar. Cada embalagem sai da torrefação em Brasília com o lote,
            o produtor e a data de torra impressos. Nada de café anônimo.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-5 border-t border-cream/15 pt-8">
            {PACOTE_SPECS.map((s) => (
              <div key={s.k}>
                <dt className="label text-muted">{s.k}</dt>
                <dd className="mt-1 text-lg">{s.v}</dd>
              </div>
            ))}
          </dl>
          <Link
            to="/loja"
            className="group label mt-10 inline-flex items-center gap-4 text-cream hover:text-jungle"
          >
            Escolher meu lote
            <ArrowCircle size="sm" />
          </Link>
        </Reveal>

        <Reveal delay={0.12} className="md:col-span-7">
          <div className="relative">
            <VideoPlayer
              src="/videos/lavoura.mp4"
              poster="/images/lifestyle/lavoura-poster.jpg"
              label="Vídeo: barista preparando café com a Kalango Cafés Especiais, com pacotes de 250g e caneca"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ReceitasTeaser() {
  const recipes = useRecipes();
  const list = (recipes.data ?? []).slice(0, 3);
  if (!recipes.isLoading && list.length === 0) return null;

  return (
    <section className="shell py-24 md:py-32">
      <div className="flex items-end justify-between gap-8">
        <div>
          <SectionLabel index="06">Conheça o seu café</SectionLabel>
          <h2 className="display mt-6 flex flex-wrap items-end gap-x-5 text-[11vw] leading-[0.85] md:text-[6vw]">
            <span>
              Receitas<br />em vídeo
            </span>
          </h2>
        </div>
        <Link to="/conheca-seu-cafe" className="label hidden text-muted hover:text-jungle md:block">
          Ver todas →
        </Link>
      </div>

      <div className="mt-14 grid gap-10 md:grid-cols-3">
        {recipes.isLoading && <p className="text-sm text-muted">Carregando…</p>}
        {list.map((r, i) => (
          <Reveal key={r.id} delay={i * 0.08}>
            <ReelEmbed shortcode={r.shortcode} title={r.title} />
            <p className="label mt-5 text-jungle">{r.method}</p>
            <h3 className="mt-3 text-2xl leading-tight">{r.title}</h3>
            {r.description && (
              <p className="mt-3 line-clamp-2 text-sm text-muted">{r.description}</p>
            )}
          </Reveal>
        ))}
      </div>

      <Link
        to="/conheca-seu-cafe"
        className="label mt-12 inline-block text-muted hover:text-jungle md:hidden"
      >
        Ver todas →
      </Link>
    </section>
  );
}

function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const lead = useCreateLead();

  return (
    <section className="grain relative overflow-hidden bg-jungle py-24 text-cream md:py-28">
      {/* Pattern de grãos do manual da marca */}
      <div
        className="pattern-graos pointer-events-none absolute inset-0 opacity-[0.07]"
        aria-hidden="true"
      />
      <div className="shell relative grid gap-10 md:grid-cols-2 md:items-center">
        <h2 className="display text-[10vw] leading-[0.88] md:text-[5vw]">
          Torra fresca<br />no seu email
        </h2>
        <div>
          <p className="max-w-sm text-sm text-cream/85">
            Avisamos quando um microlote novo sai da torrefação. Sem spam, só café.
          </p>
          {done
            ? <p className="mt-8 text-lg">Pronto. Você entrou na lista.</p>
            : (
              <form
                className="mt-8 flex items-end gap-4 border-b border-cream/40 pb-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  lead.mutate(
                    { kind: "newsletter", name: email.split("@")[0] || "Assinante", email },
                    { onSuccess: () => setDone(true) }
                  );
                }}
              >
                <input
                  type="email"
                  required
                  aria-label="Seu e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-transparent text-lg outline-none placeholder:text-cream/50"
                />
                <button
                  type="submit"
                  disabled={lead.isPending}
                  className="label shrink-0 disabled:opacity-60"
                >
                  {lead.isPending ? <Spinner /> : "Assinar →"}
                </button>
              </form>
            )}
        </div>
      </div>
    </section>
  );
}

export default function Index() {
  useSeo({
    title: "Início",
    description:
      "Torrefação de cafés especiais em Brasília-DF. Microlotes rastreados do Cerrado Mineiro e Sul de Minas, com fermentação controlada e torra sob medida. Entrega para todo o Brasil.",
    path: "/",
    image: "/images/lifestyle/pacote-lavoura.jpg",
    jsonLd: [{
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/#home`,
      name: "Kalango Cafés Especiais",
      isPartOf: { "@id": `${SITE_URL}/#site` },
      about: { "@id": `${SITE_URL}/#organizacao` },
      inLanguage: "pt-BR",
    }],
  });

  return (
    <>
      <Hero />
      <Marquee />
      <Selection />
      <FeaturedCarousel />
      <Manifesto />
      <Pacote />
      <ReceitasTeaser />
      <Newsletter />
    </>
  );
}
