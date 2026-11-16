import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Instagram, Menu, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useCart } from "../lib/cart";
import { brl } from "../lib/format";
import { cn } from "../lib/utils";

const NAV = [
  { href: "/loja", label: "Loja" },
  { href: "/sobre", label: "Sobre" },
  { href: "/clube", label: "Clube & Atacado" },
  { href: "/conheca-seu-cafe", label: "Conheça o seu café" },
  { href: "/contato", label: "Contato" },
];

export const WHATSAPP = "https://wa.me/5561995937582";
export const PHONE_LABEL = "+55 61 99593-7582";
export const EMAIL = "kalangocafe@gmail.com";
export const ADDRESS = "SHIN CA3 Lotes 33/34 loja 7 — Lago Norte, Brasília-DF";
export const INSTAGRAM = "https://www.instagram.com/kalango_cafe/";
export const INSTAGRAM_HANDLE = "@kalango_cafe";

function Header() {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const cart = useCart();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenu(false), [location]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 text-cream transition-all duration-500",
          scrolled ? "bg-ink/92 py-3 backdrop-blur-md" : "py-5"
        )}
      >
        <div className="shell flex items-center justify-between gap-6">
          <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="Kalango Cafés Especiais">
            <img
              src="/images/brand/logo-h-neg.webp"
              alt="Kalango Cafés Especiais"
              className="h-8 w-auto sm:h-9 md:h-10"
            />
            <span className="label hidden text-[9px] leading-none text-lime lg:block">
              CAFÉS
              <br />
              ESPECIAIS
            </span>
          </Link>

          <nav className="hidden items-center gap-9 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "link-underline label transition-colors hover:text-jungle",
                  location.startsWith(item.href) && "text-jungle"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={INSTAGRAM}
              target="_blank"
              rel="noreferrer"
              aria-label={`Instagram ${INSTAGRAM_HANDLE}`}
              className="flex items-center p-2.5 text-white transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-110"
              style={{
                background:
                  "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)",
              }}
            >
              <Instagram className="size-4" strokeWidth={1.75} />
            </a>
            <button
              type="button"
              onClick={cart.open}
              className="group flex items-center gap-2 border border-cream/25 px-4 py-2.5 transition-colors hover:border-jungle hover:text-jungle"
              aria-label="Abrir carrinho"
            >
              <ShoppingBag className="size-4" strokeWidth={1.5} />
              <span className="label">{cart.count}</span>
            </button>
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="border border-cream/25 p-2.5 transition-colors hover:border-jungle hover:text-jungle lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-ink text-cream lg:hidden"
          >
            <div className="shell flex h-full flex-col py-6">
              <div className="flex items-center justify-between">
                <img
                  src="/images/brand/logo-h-neg.webp"
                  alt="Kalango Cafés Especiais"
                  className="h-9 w-auto"
                />
                <button type="button" onClick={() => setMenu(false)} aria-label="Fechar menu">
                  <X className="size-6" strokeWidth={1.4} />
                </button>
              </div>
              <nav className="mt-16 flex flex-col gap-2">
                {[{ href: "/", label: "Início" }, ...NAV].map((item, i) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link to={item.href} className="display block py-3 text-5xl hover:text-jungle">
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>
              <a href={WHATSAPP} className="label mt-auto text-jungle">
                WHATSAPP →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CartDrawer() {
  const cart = useCart();
  return (
    <AnimatePresence>
      {cart.isOpen && (
        <>
          <motion.button
            type="button"
            aria-label="Fechar carrinho"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cart.close}
            className="fixed inset-0 z-[70] bg-ink/70 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-md flex-col bg-cream text-ink"
          >
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
              <span className="label">Carrinho ({cart.count})</span>
              <button type="button" onClick={cart.close} aria-label="Fechar">
                <X className="size-5" strokeWidth={1.4} />
              </button>
            </div>

            {cart.lines.length === 0
              ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                  <p className="display text-3xl">Carrinho vazio</p>
                  <p className="text-sm text-muted">Comece pelos microlotes da temporada.</p>
                  <Link
                    to="/loja"
                    onClick={cart.close}
                    className="label border border-ink px-6 py-3 transition-colors hover:bg-ink hover:text-cream"
                  >
                    Ver a loja
                  </Link>
                </div>
              )
              : (
                <>
                  <div className="flex-1 divide-y divide-ink/10 overflow-y-auto px-6">
                    {cart.lines.map((line) => (
                      <div key={`${line.slug}-${line.grind}`} className="flex gap-4 py-5">
                        {line.image && (
                          <img
                            src={line.image}
                            alt={line.name}
                            className="size-20 shrink-0 object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="display text-base leading-tight">{line.name}</p>
                          <p className="label mt-1 text-muted">{line.grind}</p>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center border border-ink/20">
                              <button
                                type="button"
                                aria-label="Diminuir"
                                onClick={() =>
                                  cart.setQuantity(line.slug, line.grind, line.quantity - 1)}
                                className="px-2.5 py-1.5 hover:text-jungle"
                              >
                                <Minus className="size-3" />
                              </button>
                              <span className="min-w-8 text-center text-sm">{line.quantity}</span>
                              <button
                                type="button"
                                aria-label="Aumentar"
                                onClick={() =>
                                  cart.setQuantity(line.slug, line.grind, line.quantity + 1)}
                                className="px-2.5 py-1.5 hover:text-jungle"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>
                            <span className="text-sm">{brl(line.unitCents * line.quantity)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-ink/10 px-6 py-5">
                    <div className="flex items-center justify-between">
                      <span className="label text-muted">Subtotal</span>
                      <span className="display text-2xl">{brl(cart.subtotalCents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {cart.subtotalCents >= 25000
                        ? "Frete grátis liberado."
                        : `Faltam ${brl(25000 - cart.subtotalCents)} para frete grátis.`}
                    </p>
                    <Link
                      to="/checkout"
                      onClick={cart.close}
                      className="label mt-5 block bg-ink px-6 py-4 text-center text-cream transition-colors hover:bg-jungle"
                    >
                      Finalizar compra
                    </Link>
                    <Link
                      to="/carrinho"
                      onClick={cart.close}
                      className="label mt-2 block py-2 text-center text-muted hover:text-ink"
                    >
                      Ver carrinho completo
                    </Link>
                  </div>
                </>
              )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Footer() {
  return (
    <footer className="grain relative hidden overflow-hidden bg-ink pt-24 pb-10 text-cream md:block">
      <div className="mosaic-rule absolute inset-x-0 top-0" />
      {/* Pattern de grãos do manual da marca, bem discreto atrás do conteúdo */}
      <div
        className="pattern-graos pointer-events-none absolute inset-0 opacity-[0.06]"
        aria-hidden="true"
      />
      <div className="shell relative">
        <img
          src="/images/brand/logo-lockup-neg.webp"
          alt="Kalango Cafés Especiais"
          className="w-full max-w-2xl"
        />
        <div className="mt-14 grid gap-10 border-t border-ink-line pt-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="max-w-sm text-sm text-cream/60">
              Torrefação de cafés especiais com foco em microlotes rastreados, produtores parceiros e
              torra sob medida para cada lote.
            </p>
            <a
              href={WHATSAPP}
              className="label mt-6 inline-flex items-center gap-2 text-jungle hover:text-jungle-lit"
            >
              Falar no WhatsApp →
            </a>
          </div>
          <div>
            <p className="label text-muted">Navegar</p>
            <ul className="mt-4 space-y-2 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link to={item.href} className="link-underline hover:text-jungle">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label text-muted">Contato</p>
            <ul className="mt-4 space-y-2 text-sm text-cream/70">
              <li>
                <a
                  href={`mailto:${EMAIL}`}
                  className="link-underline break-all hover:text-jungle"
                >
                  {EMAIL}
                </a>
              </li>
              <li>
                <a href={WHATSAPP} className="link-underline hover:text-jungle">
                  {PHONE_LABEL}
                </a>
              </li>
              <li className="pt-1 leading-relaxed">
                SHIN CA3 Lotes 33/34 loja 7<br />Lago Norte — Brasília-DF
              </li>
            </ul>
          </div>
        </div>
        <div className="label mt-12 flex flex-col justify-between gap-3 text-muted md:flex-row md:items-center">
          <span>
            © {new Date().getFullYear()} Kalango Cafés Especiais{" "}
            <span className="px-1 text-cream/30">|</span> Desenvolvido por{" "}
            <span className="text-cream-dim">Ruan Carlos</span>
          </span>
          <span>Torrado em pequenos lotes • Enviamos para todo o Brasil</span>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location]);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
