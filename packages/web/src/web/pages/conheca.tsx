import { Instagram } from "lucide-react";
import { Reveal, SectionLabel, Spinner } from "../components/primitives";
import { ReelEmbed } from "../components/reel";
import { INSTAGRAM, WHATSAPP } from "../components/layout";
import { breadcrumb, SITE_URL, useSeo } from "../lib/seo";
import { useRecipes, useRecipeTexts } from "../queries/recipes";

export const CONHECA_PATH = "/conheca-seu-cafe";

export default function Conheca() {
  const recipes = useRecipes();
  const texts = useRecipeTexts();
  const list = recipes.data ?? [];
  const t = texts.data;

  useSeo({
    title: "Conheça o seu café — receitas em vídeo",
    description:
      "Receitas em vídeo da Kalango: método, proporção e tempo de extração pra tirar o melhor de cada microlote em casa.",
    path: CONHECA_PATH,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "@id": `${SITE_URL}${CONHECA_PATH}#receitas`,
        name: "Conheça o seu café — receitas Kalango",
        inLanguage: "pt-BR",
        itemListElement: list.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "VideoObject",
            name: r.title,
            description: r.description ?? `Receita ${r.method} da Kalango Cafés Especiais.`,
            url: r.instagramUrl,
            embedUrl: `https://www.instagram.com/reel/${r.shortcode}/embed`,
            uploadDate: new Date(r.createdAt).toISOString(),
            publisher: { "@id": `${SITE_URL}/#organizacao` },
          },
        })),
      },
      breadcrumb([
        { name: "Início", path: "/" },
        { name: "Conheça o seu café", path: CONHECA_PATH },
      ]),
    ],
  });

  return (
    <>
      <section className="grain relative overflow-hidden bg-ink pt-40 pb-16 text-cream md:pt-48">
        <div className="shell relative">
          <SectionLabel className="text-cream/70" index="04">
            {t?.["conheca.kicker"] ?? "Conheça o seu café"}
          </SectionLabel>
          <h1 className="display mt-8 text-[13vw] leading-[0.84] md:text-[8.5vw]">
            {t?.["conheca.titulo"] ?? "Conheça o seu café"}
          </h1>
          <p className="mt-8 max-w-xl whitespace-pre-line text-cream/70">
            {t?.["conheca.intro"] ??
              "Receitas em vídeo direto da torrefação: o método, a proporção e o tempo que a gente usa pra extrair o melhor de cada microlote."}
          </p>
        </div>
      </section>

      <section className="shell py-16 md:py-24">
        {recipes.isLoading && (
          <div className="flex items-center gap-3 text-muted">
            <Spinner /> <span className="label">Carregando receitas…</span>
          </div>
        )}

        {!recipes.isLoading && list.length === 0 && (
          <div className="border border-ink/15 px-8 py-16 text-center">
            <p className="display text-3xl">Em breve</p>
            <p className="mt-4 text-sm text-muted">
              As receitas em vídeo aparecem aqui assim que forem publicadas.
            </p>
            <a
              href={INSTAGRAM}
              target="_blank"
              rel="noreferrer"
              className="label mt-8 inline-flex items-center gap-2 text-jungle"
            >
              <Instagram className="size-3.5" strokeWidth={1.6} />
              Ver no Instagram
            </a>
          </div>
        )}

        {list.length > 0 && (
          <div className="grid gap-x-8 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
            {list.map((r, i) => (
              <Reveal key={r.id} delay={(i % 3) * 0.08}>
                <article>
                  <ReelEmbed shortcode={r.shortcode} title={r.title} />
                  <p className="label mt-5 text-jungle">{r.method}</p>
                  <h2 className="display mt-3 text-3xl leading-tight">{r.title}</h2>
                  {r.description && (
                    <p className="mt-3 whitespace-pre-line text-sm text-muted">{r.description}</p>
                  )}
                  <a
                    href={r.instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="label mt-5 inline-flex items-center gap-2 text-muted hover:text-jungle"
                  >
                    <Instagram className="size-3.5" strokeWidth={1.6} />
                    Abrir no Instagram
                  </a>
                </article>
              </Reveal>
            ))}
          </div>
        )}

        <div className="mt-20 flex flex-wrap items-center justify-between gap-6 border-t border-ink/15 pt-10">
          <p className="max-w-md text-muted">
            {t?.["conheca.cta"] ?? "Ficou com dúvida no preparo? Chama a gente no WhatsApp."}
          </p>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noreferrer"
            className="label border border-ink/20 px-8 py-4 transition-colors hover:border-jungle hover:text-jungle"
          >
            Falar no WhatsApp
          </a>
        </div>
      </section>
    </>
  );
}
