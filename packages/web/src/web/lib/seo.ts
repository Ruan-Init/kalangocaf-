/**
 * Head dinâmico + dados estruturados (JSON-LD).
 *
 * Limitação conhecida: isto roda no cliente. O Googlebot executa JS e enxerga
 * tudo, mas boa parte dos crawlers de IA (GPTBot, PerplexityBot) não executa.
 * Por isso o JSON-LD de Organization/LocalBusiness/WebSite está estático no
 * index.html e o catálogo completo vive no /llms.txt — os dois cobrem quem não
 * roda JavaScript.
 */
import { useEffect } from "react";

export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "https://kalangocafe.com.br")
  .replace(/\/$/, "");

export const BRAND = "Kalango Cafés Especiais";

export function abs(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

type SeoInput = {
  /** Título da página, sem a marca — ela é anexada automaticamente. */
  title: string;
  description: string;
  /** Caminho canônico, ex.: "/loja" ou "/cafe/alquimia". */
  path: string;
  image?: string | null;
  type?: "website" | "product" | "article";
  noindex?: boolean;
  /** Blocos de dados estruturados desta página. */
  jsonLd?: unknown[];
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function useSeo(seo: SeoInput) {
  const {
    title,
    description,
    path,
    image = null,
    type = "website",
    noindex = false,
    jsonLd = [],
  } = seo;

  const canonical = `${SITE_URL}${path === "/" ? "" : path}`;
  const fullTitle = path === "/" ? `${BRAND} — Torrefação de microlotes em Brasília` : `${title} | ${BRAND}`;
  const ogImage = abs(image) ?? `${SITE_URL}/images/brand/logo-lockup.png`;
  // serializa aqui pra dependência do efeito ser estável entre renders
  const jsonLdRaw = JSON.stringify(jsonLd);

  useEffect(() => {
    document.title = fullTitle;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    upsertLink("canonical", canonical);

    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:type", type === "article" ? "article" : "website");
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:site_name", BRAND);
    upsertMeta("property", "og:locale", "pt_BR");

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);
  }, [fullTitle, description, canonical, type, ogImage, noindex]);

  useEffect(() => {
    const blocks: unknown[] = JSON.parse(jsonLdRaw);
    if (blocks.length === 0) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.seo = "page";
    el.textContent = JSON.stringify(blocks.length === 1 ? blocks[0] : blocks);
    document.head.appendChild(el);
    return () => el.remove();
  }, [jsonLdRaw]);
}

/** Trilha de navegação — ajuda o Google a montar o breadcrumb no resultado. */
export function breadcrumb(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path === "/" ? "" : t.path}`,
    })),
  };
}
