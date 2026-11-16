/**
 * Fundo do hero da home: fotos da Kalango em crossfade com zoom lento.
 * Troca a cada INTERVAL ms, pausa com a aba oculta e respeita reduced-motion.
 */
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export const HERO_SLIDES = [
  { src: "/images/hero/hero-01.jpg", alt: "Pacote Kalango Café Especial nas mãos", pos: "50% 45%" },
  { src: "/images/hero/hero-02.jpg", alt: "Grãos recém-torrados nas mãos do torrador", pos: "50% 50%" },
  { src: "/images/hero/hero-03.jpg", alt: "Grãos no visor do torrador", pos: "50% 50%" },
  { src: "/images/hero/hero-04.jpg", alt: "Caneca Kalango com o lagarto de mosaico", pos: "50% 45%" },
  { src: "/images/hero/hero-05.jpg", alt: "Jarra vermelha de leite com o lagarto Kalango", pos: "50% 45%" },
  { src: "/images/hero/hero-06.jpg", alt: "Pacote Kalango em fundo escuro", pos: "50% 45%" },
  { src: "/images/hero/hero-07.jpg", alt: "Cappuccino com latte art servido pela Kalango", pos: "50% 65%" },
] as const;

const INTERVAL = 6000;

export function HeroCarousel() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = HERO_SLIDES.length;

  const go = useCallback((n: number) => setIndex(((n % total) + total) % total), [total]);

  useEffect(() => {
    if (paused || reduce) return;
    const t = window.setTimeout(() => go(index + 1), INTERVAL);
    return () => window.clearTimeout(t);
  }, [index, paused, reduce, go]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Pré-carrega a próxima foto para o crossfade não piscar.
  useEffect(() => {
    const next = new Image();
    next.src = HERO_SLIDES[(index + 1) % total].src;
  }, [index, total]);

  const slide = HERO_SLIDES[index];

  return (
    <>
      {/* Mobile: fundo inteiro. Desktop: painel vertical à direita (as fotos são 2:3). */}
      <div
        className="hero-panel absolute inset-0 overflow-hidden lg:left-auto lg:w-[52%] xl:w-[48%]"
        aria-roledescription="carrossel"
        aria-label="Fotos da Kalango"
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            fetchPriority={index === 0 ? "high" : "auto"}
            decoding="async"
            initial={{ opacity: 0, scale: reduce ? 1 : 1.08 }}
            animate={{ opacity: 1, scale: reduce ? 1 : 1 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 1.4, ease: "easeInOut" },
              scale: { duration: (INTERVAL + 1400) / 1000, ease: "linear" },
            }}
            style={{ objectPosition: slide.pos }}
            className="absolute inset-0 size-full object-cover"
          />
        </AnimatePresence>
        {/* Leitura do texto. Mobile: escurece de baixo pra cima. Desktop: máscara .hero-panel some com as bordas. */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30 lg:hidden" />
        <div className="absolute inset-0 hidden bg-ink/25 lg:block" />
      </div>

      {/* Controles: canto superior direito, abaixo do header fixo. */}
      <div className="absolute top-28 right-6 z-10 flex items-center gap-4 md:top-32 md:right-10 lg:right-16">
        <span className="label tabular-nums text-cream/70">
          {String(index + 1).padStart(2, "0")}
          <span className="text-cream/35"> / {String(total).padStart(2, "0")}</span>
        </span>
        <div className="hidden gap-1.5 sm:flex">
          {HERO_SLIDES.map((s, i) => (
            <button
              key={s.src}
              type="button"
              aria-label={`Foto ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className="relative h-[2px] w-7 overflow-hidden bg-cream/25"
            >
              <span
                key={i === index ? `on-${index}` : "off"}
                className={cn(
                  "absolute inset-y-0 left-0 bg-cream",
                  i < index && "w-full",
                  i === index && (reduce || paused ? "w-full" : "hero-progress")
                )}
                style={i === index && !reduce && !paused ? { animationDuration: `${INTERVAL}ms` } : undefined}
              />
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => go(index - 1)}
            className="grid size-9 place-items-center rounded-full border border-cream/30 text-cream/80 transition-colors hover:border-cream hover:text-cream"
          >
            <ChevronLeft className="size-4" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => go(index + 1)}
            className="grid size-9 place-items-center rounded-full border border-cream/30 text-cream/80 transition-colors hover:border-cream hover:text-cream"
          >
            <ChevronRight className="size-4" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </>
  );
}
