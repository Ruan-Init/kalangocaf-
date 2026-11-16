import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useMerch, useProducts } from "../queries/catalog";
import { ProductCard } from "../components/product-card";
import { MerchCard } from "../components/merch-card";
import { ProductSkeleton, Reveal, SectionLabel } from "../components/primitives";
import { cn } from "../lib/utils";
import { toneFor } from "../lib/mosaic";
import { abs, breadcrumb, SITE_URL, useSeo } from "../lib/seo";

const SORTS = [
  { id: "curadoria", label: "Curadoria" },
  { id: "menor", label: "Menor preço" },
  { id: "maior", label: "Maior preço" },
  { id: "pontuacao", label: "Pontuação" },
] as const;

const TABS = [
  { id: "cafes", label: "Cafés" },
  { id: "lifestyle", label: "Lifestyle" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function Loja() {
  const search = useSearch();
  const products = useProducts();
  const merch = useMerch();
  const [tab, setTab] = useState<Tab>(
    new URLSearchParams(search).get("aba") === "lifestyle" ? "lifestyle" : "cafes"
  );
  const [family, setFamily] = useState("Todos");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("curadoria");

  const isLifestyle = tab === "lifestyle";
  const catalogo = products.data ?? [];
  const lifestyle = merch.data ?? [];

  useSeo({
    title: isLifestyle
      ? "Lifestyle — boné, caneca, camiseta e chaveiro"
      : "Loja — todos os cafés especiais",
    description: isLifestyle
      ? "A linha lifestyle da Kalango: boné, caneca, camiseta e chaveiro com o kalango do cerrado. Em pré-lançamento — entre na lista de espera e seja avisado primeiro."
      : "Catálogo completo da Kalango: microlotes de café especial em pacotes de 250g, em grãos ou moídos para o seu método. Filtre por família sensorial e receba em todo o Brasil.",
    path: isLifestyle ? "/loja?aba=lifestyle" : "/loja",
    jsonLd: catalogo.length > 0 && !isLifestyle
      ? [
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          "@id": `${SITE_URL}/loja#lista`,
          name: "Cafés especiais Kalango",
          numberOfItems: catalogo.length,
          itemListElement: catalogo.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: p.name,
              url: `${SITE_URL}/cafe/${p.slug}`,
              image: abs(p.images[0]) ?? undefined,
              sku: p.sku ?? p.slug,
              brand: { "@type": "Brand", name: "Kalango Cafés Especiais" },
              offers: {
                "@type": "Offer",
                priceCurrency: "BRL",
                price: (p.priceCents / 100).toFixed(2),
                availability: p.stock > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
              },
            },
          })),
        },
        breadcrumb([{ name: "Início", path: "/" }, { name: "Loja", path: "/loja" }]),
      ]
      : [breadcrumb([{ name: "Início", path: "/" }, { name: "Loja", path: "/loja" }])],
  });

  const families = useMemo(() => {
    const set = new Set((products.data ?? []).map((p) => p.notes[0]).filter(Boolean));
    return ["Todos", ...Array.from(set)];
  }, [products.data]);

  const list = useMemo(() => {
    let out = [...(products.data ?? [])];
    if (family !== "Todos") out = out.filter((p) => p.notes[0] === family);
    if (sort === "menor") out.sort((a, b) => a.priceCents - b.priceCents);
    if (sort === "maior") out.sort((a, b) => b.priceCents - a.priceCents);
    if (sort === "pontuacao") out.sort((a, b) => (b.scaScore ?? 0) - (a.scaScore ?? 0));
    return out;
  }, [products.data, family, sort]);

  return (
    <>
      <section className="grain relative overflow-hidden bg-ink pt-40 pb-16 text-cream md:pt-48">
        <div
          className={cn(
            "absolute -top-24 right-0 size-[420px] rounded-full blur-[140px] transition-colors duration-700",
            isLifestyle ? "bg-ocean/25" : "bg-jungle/20"
          )}
        />
        <div className="shell relative">
          <SectionLabel className="text-cream/70" index={isLifestyle ? "LIFESTYLE" : "LOJA"}>
            {isLifestyle
              ? `${lifestyle.length} itens em pré-lançamento`
              : `${catalogo.length} microlotes disponíveis`}
          </SectionLabel>
          <h1 className="display mt-8 text-[13vw] leading-[0.86] md:text-[10vw]">
            {isLifestyle
              ? (
                <>
                  Veste o<br />
                  <span className="text-transparent [-webkit-text-stroke:1.5px_#EFE9D0]">kalango</span>
                </>
              )
              : (
                <>
                  Todos os<br />
                  <span className="text-transparent [-webkit-text-stroke:1.5px_#EFE9D0]">cafés</span>
                </>
              )}
          </h1>
        </div>
      </section>

      <section className="shell py-14 md:py-20">
        <div className="flex gap-8 border-b border-ink/15">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "display -mb-px border-b-2 pb-4 text-3xl leading-none transition-colors md:text-4xl",
                tab === t.id
                  ? "border-jungle text-ink"
                  : "border-transparent text-ink/30 hover:text-ink/60"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLifestyle
          ? (
            <>
              <div className="mt-10 flex flex-col gap-6 border-b border-ink/15 pb-8 md:flex-row md:items-end md:justify-between">
                <p className="max-w-xl text-[15px] text-muted leading-relaxed">
                  Boné, caneca, camiseta e chaveiro com o bicho teimoso do cerrado. Ainda estamos
                  fechando fornecedor e preço — deixe seu e-mail e você fica sabendo antes de ir pro
                  site.
                </p>
                <span className="label shrink-0 border border-ocean/40 px-4 py-2.5 text-ocean">
                  Pré-lançamento
                </span>
              </div>

              <div className="mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
                {merch.isLoading
                  && Array.from({ length: 4 }).map((_, i) => <ProductSkeleton key={i} />)}
                {merch.isError && <p className="text-sm text-muted">Erro ao carregar a linha.</p>}
                {lifestyle.map((m, i) => (
                  <Reveal key={m.id} delay={(i % 3) * 0.06}>
                    <MerchCard item={m} />
                  </Reveal>
                ))}
              </div>

              {!merch.isLoading && lifestyle.length === 0 && (
                <p className="py-20 text-center text-sm text-muted">
                  A linha lifestyle chega em breve.
                </p>
              )}
            </>
          )
          : (
            <>
              <div className="mt-10 flex flex-col gap-6 border-b border-ink/15 pb-6 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {families.map((f) => {
                    const tone = toneFor(f);
                    const isAll = f === "Todos";
                    const active = family === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFamily(f)}
                        className={cn(
                          "label flex items-center gap-2 border px-4 py-2.5 transition-colors",
                          active
                            ? isAll ? "border-ink bg-ink text-cream" : tone.solid
                            : "border-ink/20 text-muted hover:border-ink hover:text-ink"
                        )}
                      >
                        {!isAll && (
                          <span
                            className={cn(
                              "size-2 rounded-full transition-colors",
                              active ? "bg-ink/40" : tone.dot
                            )}
                          />
                        )}
                        {f}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <span className="label text-muted">Ordenar</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="label border border-ink/20 bg-transparent px-3 py-2.5 outline-none"
                  >
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
                {products.isLoading
                  && Array.from({ length: 6 }).map((_, i) => <ProductSkeleton key={i} />)}
                {products.isError && <p className="text-sm text-muted">Erro ao carregar o catálogo.</p>}
                {list.map((p, i) => (
                  <Reveal key={p.id} delay={(i % 3) * 0.06}>
                    <ProductCard product={p} />
                  </Reveal>
                ))}
              </div>

              {!products.isLoading && list.length === 0 && (
                <p className="py-20 text-center text-sm text-muted">
                  Nenhum café nessa família por enquanto.
                </p>
              )}
            </>
          )}
      </section>
    </>
  );
}
