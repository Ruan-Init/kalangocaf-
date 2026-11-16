import { Link } from "wouter";
import { Minus, Plus, X } from "lucide-react";
import { useCart } from "../lib/cart";
import { brl, installmentsNote } from "../lib/format";
import { SectionLabel } from "../components/primitives";
import { useSeo } from "../lib/seo";

const FRETE_GRATIS = 25000;

export default function Carrinho() {
  const cart = useCart();
  useSeo({ title: "Carrinho", description: "", path: "/carrinho", noindex: true });


  return (
    <>
      <section className="grain relative overflow-hidden bg-ink pt-40 pb-16 text-cream md:pt-48">
        <div className="shell relative">
          <SectionLabel className="text-cream/70" index="—">
            {cart.count} {cart.count === 1 ? "item" : "itens"}
          </SectionLabel>
          <h1 className="display mt-8 text-[13vw] leading-[0.86] md:text-[9vw]">Carrinho</h1>
        </div>
      </section>

      {cart.lines.length === 0
        ? (
          <section className="shell flex min-h-[45vh] flex-col items-center justify-center gap-6 py-24 text-center">
            <p className="display text-5xl">Ainda não tem café aqui</p>
            <p className="max-w-sm text-muted">
              Escolha um microlote da temporada e a gente torra depois do seu pedido.
            </p>
            <Link
              to="/loja"
              className="label border border-ink px-8 py-4 transition-colors hover:bg-ink hover:text-cream"
            >
              Ver a loja
            </Link>
          </section>
        )
        : (
          <section className="shell grid gap-14 py-16 md:py-24 lg:grid-cols-[1.6fr_1fr]">
            <div className="divide-y divide-ink/12 border-y border-ink/12">
              {cart.lines.map((line) => (
                <div key={`${line.slug}-${line.grind}`} className="flex gap-6 py-8">
                  <Link to={`/cafe/${line.slug}`} className="shrink-0 overflow-hidden bg-ink/5">
                    <img
                      src={line.image ?? "/images/brand/kalango-mosaico.png"}
                      alt={line.name}
                      className="size-28 object-cover md:size-36"
                    />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          to={`/cafe/${line.slug}`}
                          className="display text-2xl leading-none hover:text-jungle md:text-3xl"
                        >
                          {line.name}
                        </Link>
                        <p className="label mt-2 text-muted">Moagem: {line.grind}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remover"
                        onClick={() => cart.remove(line.slug, line.grind)}
                        className="text-muted transition-colors hover:text-jungle"
                      >
                        <X className="size-5" strokeWidth={1.4} />
                      </button>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                      <div className="flex items-center border border-ink/20">
                        <button
                          type="button"
                          aria-label="Diminuir"
                          onClick={() => cart.setQuantity(line.slug, line.grind, line.quantity - 1)}
                          className="px-3 py-2 hover:text-jungle"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="min-w-10 text-center text-sm">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label="Aumentar"
                          onClick={() => cart.setQuantity(line.slug, line.grind, line.quantity + 1)}
                          className="px-3 py-2 hover:text-jungle"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="display text-2xl">{brl(line.unitCents * line.quantity)}</p>
                        <p className="text-xs text-muted">{brl(line.unitCents)} cada</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-between py-6">
                <button
                  type="button"
                  onClick={cart.clear}
                  className="label text-muted transition-colors hover:text-jungle"
                >
                  Esvaziar carrinho
                </button>
                <Link to="/loja" className="label link-underline">
                  Continuar comprando
                </Link>
              </div>
            </div>

            <aside className="h-fit border border-ink/15 p-8 lg:sticky lg:top-32">
              <SectionLabel index="—">Resumo</SectionLabel>
              <div className="mt-8 space-y-4 border-b border-ink/12 pb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span>{brl(cart.subtotalCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Frete</span>
                  <span>
                    {cart.subtotalCents >= FRETE_GRATIS ? "Grátis" : "Calculado no checkout"}
                  </span>
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <span className="label text-muted">Total</span>
                <span className="display text-4xl">{brl(cart.subtotalCents)}</span>
              </div>
              <p className="mt-2 text-right text-xs text-muted">{installmentsNote()}</p>
              {cart.subtotalCents < FRETE_GRATIS && (
                <p className="mt-6 border border-jungle/40 bg-jungle/5 p-4 text-xs text-ink/70">
                  Faltam <strong>{brl(FRETE_GRATIS - cart.subtotalCents)}</strong> para o frete sair
                  de graça.
                </p>
              )}
              <Link
                to="/checkout"
                className="label mt-8 block bg-ink px-6 py-4 text-center text-cream transition-colors hover:bg-jungle"
              >
                Finalizar compra
              </Link>
              <p className="mt-4 text-center text-xs text-muted">
                Torrado sob demanda • Envio em até 2 dias úteis
              </p>
            </aside>
          </section>
        )}
    </>
  );
}
