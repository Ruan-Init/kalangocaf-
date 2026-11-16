import { useState } from "react";
import { Link, useParams } from "wouter";
import { Check, Minus, Plus, Truck } from "lucide-react";
import { useProduct, useRelated } from "../queries/catalog";
import { ProductCard } from "../components/product-card";
import { ArrowCircle, Reveal, SectionLabel, Spinner } from "../components/primitives";
import { brl, installmentsNote, slugTitle } from "../lib/format";
import { useCart } from "../lib/cart";
import { cn } from "../lib/utils";
import { toneFor } from "../lib/mosaic";
import { abs, breadcrumb, SITE_URL, useSeo } from "../lib/seo";

const GRINDS = ["Grãos", "Espresso", "Coado", "Prensa francesa", "Italiana"];

export default function Produto() {
  const { slug = "" } = useParams<{ slug: string }>();
  const product = useProduct(slug);
  const related = useRelated(slug, 3);
  const cart = useCart();

  const [grind, setGrind] = useState(GRINDS[0]);
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);

  // Hook antes dos early returns: os dados podem ainda não ter chegado.
  const d = product.data;
  useSeo({
    title: d ? `${d.name} — Café Especial 250g` : "Café",
    description: d
      ? (d.shortDescription
        ?? `${d.name}: microlote de café especial torrado pela Kalango. ${
          d.notes.length ? `Notas de ${d.notes.join(", ").toLowerCase()}. ` : ""
        }Pacote de 250g, em grãos ou moído para o seu método.`)
      : "Microlote de café especial torrado em Brasília pela Kalango.",
    path: `/cafe/${slug}`,
    image: d?.images[0] ?? null,
    type: "product",
    noindex: !d,
    jsonLd: d
      ? [
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": `${SITE_URL}/cafe/${d.slug}#produto`,
          name: `${d.name} — Café Especial 250g`,
          sku: d.sku ?? d.slug,
          description: d.shortDescription ?? d.description ?? undefined,
          image: d.images.map((i) => abs(i)).filter(Boolean),
          brand: { "@type": "Brand", name: "Kalango Cafés Especiais" },
          category: "Café em grãos",
          weight: { "@type": "QuantitativeValue", value: d.weightGrams, unitCode: "GRM" },
          additionalProperty: [
            d.variety && { name: "Variedade", value: d.variety },
            d.process && { name: "Processo", value: d.process },
            d.altitude && { name: "Altitude", value: d.altitude },
            d.origin && { name: "Origem", value: d.origin },
            d.producer && { name: "Produtor", value: d.producer },
            d.roast && { name: "Torra", value: d.roast },
            d.scaScore && { name: "Pontuação SCA", value: String(d.scaScore) },
            d.notes.length > 0 && { name: "Notas sensoriais", value: d.notes.join(", ") },
          ].filter(Boolean).map((x) => ({ "@type": "PropertyValue", ...(x as object) })),
          offers: {
            "@type": "Offer",
            url: `${SITE_URL}/cafe/${d.slug}`,
            priceCurrency: "BRL",
            price: (d.priceCents / 100).toFixed(2),
            availability: d.active && d.stock > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@id": `${SITE_URL}/#organizacao` },
          },
        },
        breadcrumb([
          { name: "Início", path: "/" },
          { name: "Loja", path: "/loja" },
          { name: d.name, path: `/cafe/${d.slug}` },
        ]),
      ]
      : [],
  });

  if (product.isLoading) {
    return (
      <div className="grid min-h-[70vh] place-items-center bg-cream">
        <Spinner className="size-8 text-jungle" />
      </div>
    );
  }

  if (product.isError || !product.data) {
    return (
      <div className="shell grid min-h-[70vh] place-items-center text-center">
        <div>
          <h1 className="display text-5xl">Café não encontrado</h1>
          <Link to="/loja" className="label mt-6 inline-block text-jungle">
            Voltar para a loja →
          </Link>
        </div>
      </div>
    );
  }

  const p = product.data;
  const [family, ...notes] = p.notes;
  // Bling manda: inativo some da loja; estoque zerado não deixa comprar.
  const vendavel = p.active && p.stock > 0;
  const specs = [
    ["Variedade", p.variety],
    ["Altitude", p.altitude],
    ["Processo", p.process],
    ["Aroma", p.aroma],
    ["Sabor", p.flavor],
    ["Acidez", p.acidity],
    ["Corpo", p.bodyNote],
    ["Finalização", p.finish],
    ["Produtor", p.producer],
    ["Origem", p.origin],
    ["Torra", p.roast],
    ["Peso", `${p.weightGrams}g`],
  ].filter(([, v]) => Boolean(v)) as [string, string][];

  return (
    <>
      <section className="bg-ink pt-32 pb-0 text-cream md:pt-36">
        <div className="shell">
          <nav className="label flex gap-2 text-muted">
            <Link to="/" className="hover:text-jungle">Início</Link>
            <span>/</span>
            <Link to="/loja" className="hover:text-jungle">Loja</Link>
            <span>/</span>
            <span className="text-cream/70">{slugTitle(p.name)}</span>
          </nav>
        </div>

        <div className="shell grid gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <div className="relative overflow-hidden bg-ink-soft">
              <img
                src={p.images[active] ?? "/images/brand/kalango-mosaico.png"}
                alt={p.name}
                className="aspect-[4/5] w-full object-cover"
              />
              {p.scaScore && (
                <span className="label absolute top-5 left-5 bg-jungle px-3 py-1.5">
                  SCA {p.scaScore}
                </span>
              )}
            </div>
            {p.images.length > 1 && (
              <div className="mt-4 flex gap-3">
                {p.images.map((img, i) => (
                  <button
                    key={img}
                    type="button"
                    aria-label={`Ver foto ${i + 1}`}
                    onClick={() => setActive(i)}
                    className={cn(
                      "size-20 overflow-hidden border transition-colors",
                      i === active ? "border-jungle" : "border-transparent opacity-60"
                    )}
                  >
                    <img src={img} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:pt-6">
            <SectionLabel className="text-cream/60">{family}</SectionLabel>
            <h1 className="display mt-5 text-[13vw] leading-[0.85] md:text-[5.5vw]">
              {slugTitle(p.name)}
            </h1>

            {notes.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {notes.map((n) => (
                  <span key={n} className="label border border-ink-line px-3 py-1.5 text-cream/70">
                    {n}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-8 max-w-md text-[15px] text-cream/70">
              {p.story ?? p.shortDescription ?? `${p.aroma ?? ""}`}
            </p>

            <div className="mt-10 flex items-end gap-5">
              <span className="display text-5xl">{brl(p.priceCents)}</span>
              <span className="pb-1 text-xs text-muted">{installmentsNote()}</span>
            </div>

            {!vendavel && (
              <p className="label mt-10 inline-block border border-gold/60 px-4 py-2.5 text-gold">
                {p.active ? "Esgotado no momento" : "Indisponível"}
              </p>
            )}

            {vendavel && (
            <>
            <div className="mt-10">
              <span className="label text-muted">Moagem</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {GRINDS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrind(g)}
                    className={cn(
                      "label border px-4 py-2.5 transition-colors",
                      grind === g
                        ? "border-jungle bg-jungle text-cream"
                        : "border-ink-line text-cream/70 hover:border-cream"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-stretch gap-4">
              <div className="flex items-center border border-ink-line">
                <button
                  type="button"
                  aria-label="Diminuir"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="px-4 py-4 hover:text-jungle"
                >
                  <Minus className="size-4" />
                </button>
                <span className="min-w-10 text-center">{qty}</span>
                <button
                  type="button"
                  aria-label="Aumentar"
                  onClick={() => setQty((q) => Math.min(20, p.stock, q + 1))}
                  className="px-4 py-4 hover:text-jungle"
                >
                  <Plus className="size-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  cart.add({
                    slug: p.slug,
                    name: slugTitle(p.name),
                    image: p.images[0] ?? null,
                    unitCents: p.priceCents,
                    grind,
                    quantity: qty,
                  })}
                className={cn(
                  "group label flex flex-1 items-center justify-between gap-4 border py-4 pr-4 pl-7 transition-colors hover:bg-ink hover:text-cream",
                  toneFor(family).solid
                )}
              >
                Adicionar ao carrinho
                <ArrowCircle size="sm" className="border-ink/30 group-hover:border-cream" />
              </button>
            </div>
            </>
            )}

            <ul className="mt-8 space-y-2 text-sm text-cream/60">
              <li className="flex items-center gap-2">
                <Truck className="size-4 text-jungle" strokeWidth={1.4} />
                Frete grátis acima de R$ 250
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 text-jungle" strokeWidth={1.4} />
                Torrado sob demanda, enviado em até 2 dias úteis
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="shell py-20 md:py-28">
        <SectionLabel index="FICHA">Análise sensorial</SectionLabel>
        <dl className="mt-10 grid gap-px border border-ink/12 bg-ink/12 sm:grid-cols-2 lg:grid-cols-3">
          {specs.map(([k, v]) => (
            <div key={k} className="bg-cream p-6">
              <dt className="label text-muted">{k}</dt>
              <dd className="mt-2 text-[15px]">{v}</dd>
            </div>
          ))}
        </dl>
        {p.description && !p.story && (
          <p className="mt-10 max-w-2xl whitespace-pre-line text-sm text-muted">{p.description}</p>
        )}
      </section>

      <section className="shell pb-28">
        <div className="flex items-end justify-between">
          <h2 className="display text-[10vw] leading-[0.85] md:text-[4.5vw]">Leve também</h2>
          <Link to="/loja" className="label text-muted hover:text-jungle">Ver tudo →</Link>
        </div>
        <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {(related.data ?? []).map((r, i) => (
            <Reveal key={r.id} delay={i * 0.07}>
              <ProductCard product={r} />
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
