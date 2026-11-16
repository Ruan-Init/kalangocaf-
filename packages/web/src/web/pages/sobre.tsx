import { Link } from "wouter";
import { Reveal, SectionLabel } from "../components/primitives";
import { breadcrumb, useSeo } from "../lib/seo";

const PILARES = [
  {
    n: "01",
    t: "Qualidade",
    d: "Grãos selecionados e perfis sensoriais marcantes em cada torra, sem abrir mão da qualidade.",
  },
  {
    n: "02",
    t: "Preço justo",
    d: "Café de alta qualidade a um preço acessível para quem mora em Brasília.",
  },
  {
    n: "03",
    t: "Respeito",
    d: "Uma experiência que respeita tanto o produtor quanto o consumidor.",
  },
];

const EQUIPE = [
  {
    nome: "Welliton Oliveira",
    cargo: "Mestre de Torra / Sócio",
    d: "Ampla experiência em torrefação de café e barismo.",
    iniciais: "WO",
    foto: "/images/team/welliton-v3.jpg",
  },
  {
    nome: "Leonardo Dias",
    cargo: "Diretor Comercial / Sócio",
    d: "",
    foto: "/images/team/leonardo.jpg",
    iniciais: "LD",
  },
  {
    nome: "David",
    cargo: "Sócio",
    d: "",
    foto: "/images/team/david.jpg",
    iniciais: "D",
  },
];

export default function Sobre() {
  useSeo({
    title: "Sobre a torrefação",
    description:
      "Quem é a Kalango: torrefação de cafés especiais em Brasília-DF. Qualidade e preço justo para democratizar o café especial na cidade.",
    path: "/sobre",
    jsonLd: [breadcrumb([{ name: "Início", path: "/" }, { name: "Sobre", path: "/sobre" }])],
  });

  return (
    <>
      <section className="grain relative overflow-hidden bg-ink pt-40 pb-20 text-cream md:pt-48">
        <div className="absolute -bottom-40 left-1/3 size-[480px] rounded-full bg-lime/20 blur-[150px]" />
        <div className="shell relative">
          <SectionLabel className="text-cream/70" index="SOBRE">
            Torrefação de cafés especiais em Brasília
          </SectionLabel>
          <h1 className="display mt-8 text-[12vw] leading-[0.86] md:text-[10.5vw]">
            Café especial<br />
            <span className="text-jungle">com preço</span><br />
            <span className="text-transparent [-webkit-text-stroke:1.5px_#EFE9D0]">justo</span>
          </h1>
        </div>
      </section>

      <section className="shell py-24 md:py-32">
        <div className="grid gap-14 lg:grid-cols-[1fr_1fr]">
          <Reveal>
            <img
              src="/images/sobre/torra-sobre.jpg"
              alt="Grãos recém-torrados nas mãos do torrador Kalango"
              className="aspect-[4/5] w-full object-cover"
            />
          </Reveal>
          <Reveal delay={0.1} className="lg:pt-10">
            <p className="text-2xl leading-[1.35] md:text-[30px]">
              A Kalango nasce da necessidade de trazer para o cenário brasiliense cafés de alta
              qualidade a um preço justo.
            </p>
            <div className="mt-8 space-y-5 text-[15px] text-muted">
              <p>
                Da união de um barista, um coffee lover e um empreendedor, somamos forças para criar
                uma marca que entrega o melhor da qualidade, sem abrir mão da acessibilidade.
              </p>
              <p>
                Somos uma torrefação de Brasília especializada em cafés de especialidade. Nosso
                propósito é democratizar o café especial na cidade, oferecendo grãos selecionados,
                perfis sensoriais marcantes e uma experiência que respeita tanto o produtor quanto o
                consumidor.
              </p>
            </div>
            <Link
              to="/loja"
              className="label mt-10 inline-block border border-ink px-8 py-4 transition-colors hover:bg-ink hover:text-cream"
            >
              Provar os cafés
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="grain relative overflow-hidden bg-ink py-24 text-cream md:py-32">
        <div className="shell relative">
          <SectionLabel className="text-cream/60" index="PROPÓSITO">O que a gente defende</SectionLabel>
          <div className="mt-14 grid gap-px bg-ink-line md:grid-cols-3">
            {PILARES.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.08} className="bg-ink p-8">
                <span className="display text-5xl text-jungle">{p.n}</span>
                <h3 className="mt-6 text-2xl">{p.t}</h3>
                <p className="mt-3 text-sm text-cream/65">{p.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-24 md:py-32">
        <SectionLabel index="EQUIPE">Quem faz a Kalango</SectionLabel>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {EQUIPE.map((m, i) => (
            <Reveal key={m.nome} delay={i * 0.08}>
              {m.foto ? (
                <img
                  src={m.foto}
                  alt={m.nome}
                  className="aspect-square w-full object-cover object-top"
                  loading="lazy"
                />
              ) : (
                <div className="display flex aspect-square items-center justify-center bg-ink text-7xl text-jungle">
                  {m.iniciais}
                </div>
              )}
              <h3 className="mt-6 text-2xl">{m.nome}</h3>
              <p className="label mt-2 text-jungle">{m.cargo}</p>
              {m.d && <p className="mt-3 text-sm text-muted">{m.d}</p>}
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
