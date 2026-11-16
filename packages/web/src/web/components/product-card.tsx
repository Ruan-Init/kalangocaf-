import { Link } from "wouter";
import type { Product } from "../../api/database/schema";
import { brl, slugTitle } from "../lib/format";
import { ArrowCircle } from "./primitives";
import { cn } from "../lib/utils";

export function ProductCard({
  product,
  dark,
  className,
}: {
  product: Product;
  dark?: boolean;
  className?: string;
}) {
  const [family, ...notes] = product.notes;
  return (
    <Link
      to={`/cafe/${product.slug}`}
      className={cn("group block", dark ? "text-cream" : "text-ink", className)}
    >
      <div className="relative overflow-hidden bg-ink/5">
        <img
          src={product.images[0] ?? "/images/brand/kalango-mosaico.png"}
          alt={product.name}
          loading="lazy"
          className="aspect-[4/5] w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
        />
        {family && (
          <span className="label absolute top-4 left-4 bg-cream/90 px-3 py-1.5 text-ink">
            {family}
          </span>
        )}
        {product.stock <= 0 && (
          <span className="label absolute top-4 right-4 bg-ink/85 px-3 py-1.5 text-cream">
            Esgotado
          </span>
        )}
        {product.scaScore && (
          <span className="label absolute right-4 bottom-4 bg-ink/85 px-3 py-1.5 text-cream">
            SCA {product.scaScore}
          </span>
        )}
        <span className="absolute inset-0 bg-ink/0 transition-colors duration-500 group-hover:bg-ink/10" />
      </div>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="display text-2xl leading-none md:text-[28px]">
            {slugTitle(product.name)}
          </h3>
        </div>
        <ArrowCircle size="sm" className="mt-1 shrink-0 opacity-60 group-hover:opacity-100" />
      </div>

      <dl
        aria-label="Prévia sensorial"
        className={cn(
          "mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t pt-4",
          dark ? "border-cream/15" : "border-ink/12"
        )}
      >
        <div className="col-span-2">
          <dt className="label text-[10px] text-muted">Notas</dt>
          <dd className="mt-1 line-clamp-1 text-[13px]">
            {sensoryNotes(product, notes) ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="label text-[10px] text-muted">Acidez</dt>
          <dd className="mt-1 line-clamp-1 text-[13px]">{product.acidity ?? "—"}</dd>
        </div>
        <div>
          <dt className="label text-[10px] text-muted">Corpo</dt>
          <dd className="mt-1 line-clamp-1 text-[13px]">{product.bodyNote ?? "—"}</dd>
        </div>
      </dl>

      <p className="mt-4 text-base">{brl(product.priceCents)}</p>
    </Link>
  );
}

/** Notas da prévia: tags do produto (sem repetir a família); se não houver, aroma/sabor. */
function sensoryNotes(product: Product, notes: string[]) {
  const family = product.notes[0];
  const list = [...new Set(notes)].filter((n) => n && n !== family);
  if (list.length) return list.join(" · ");
  return product.aroma ?? product.flavor ?? product.origin ?? null;
}
