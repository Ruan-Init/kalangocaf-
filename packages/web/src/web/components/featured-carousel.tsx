/**
 * "Lote em destaque" da home em carrossel: percorre todos os cafés do catálogo.
 * Setas, pontos, swipe na foto, teclado (← →) e troca automática que pausa no hover,
 * com a aba oculta e respeita reduced-motion.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Coffee, Leaf, Mountain, Timer } from "lucide-react";
import { useProducts } from "../queries/catalog";
import { ArrowCircle, Reveal, SectionLabel } from "./primitives";
import { brl, slugTitle } from "../lib/format";
import { cn } from "../lib/utils";

const INTERVAL = 7000;
const EASE = [0.22, 1, 0.36, 1] as const;

export function FeaturedCarousel() {
  const products = useProducts();
  const reduce = useReducedMotion();

  // Destaque primeiro, depois o resto na ordem do catálogo.
  const list = useMemo(() => {
    const all = (products.data ?? []).filter((p) => p.images[0]);
    return [...all.filter((p) => p.featured), ...all.filter((p) => !p.featured)];
  }, [products.data]);

  const total = list.length;
  const [[index, dir], setState] = useState<[number, number]>([0, 1]);
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);

  const go = useCallback(
    (n: number, d: number) => {
      if (!total) return;
      setState([((n % total) + total) % total, d]);
    },
    [total]
  );
  const next = useCallback(() => go(index + 1, 1), [go, index]);
  const prev = useCallback(() => go(index - 1, -1), [go, index]);

  useEffect(() => {
    if (hover || hidden || reduce || total < 2) return;
    const t = window.setTimeout(next, INTERVAL);
    return () => window.clearTimeout(t);
  }, [index, hover, hidden, reduce, total, next]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Pré-carrega as fotos vizinhas.
  useEffect(() => {
    if (!total) return;
    for (const k of [index + 1, index - 1]) {
      const p = list[((k % total) + total) % total];
      if (p?.images[0]) new Image().src = p.images[0];
    }
  }, [index, list, total]);

  const hero = list[index];
  const pad = (n: number) => String(n).padStart(2, "0");

  const slide = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 60 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -60 }),
  };

  return (
    // Keyboard events bubble from the existing arrow buttons; hover only pauses autoplay.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className="grain relative overflow-hidden bg-ink py-24 text-cream md:py-32"
      aria-roledescription="carrossel"
      aria-label="Cafés Kalango"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") next();
        if (e.key === "ArrowLeft") prev();
      }}
    >
      <div className="shell relative grid items-center gap-14 lg:grid-cols-2">
        <Reveal>
          <div className="relative">
            <div className="absolute -top-6 -left-6 size-28 border border-jungle/50 md:size-40" />
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#fafafa]">
              <AnimatePresence initial={false} custom={dir} mode="popLayout">
                {hero && (
                  <motion.img
                    key={hero.id}
                    src={hero.images[0]}
                    alt={hero.name}
                    custom={dir}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.6, ease: EASE }}
                    drag={total > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.25}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -60 || info.velocity.x < -400) next();
                      else if (info.offset.x > 60 || info.velocity.x > 400) prev();
                    }}
                    draggable={false}
                    className="absolute inset-0 size-full cursor-grab touch-pan-y object-cover active:cursor-grabbing"
                  />
                )}
              </AnimatePresence>
            </div>

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Café anterior"
                  className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-ink/80 text-cream backdrop-blur transition-colors hover:bg-jungle"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Próximo café"
                  className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-ink/80 text-cream backdrop-blur transition-colors hover:bg-jungle"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>

          {total > 1 && (
            <div className="mt-6 flex items-center justify-between gap-6">
              <div className="flex gap-1.5 md:gap-2" role="tablist" aria-label="Escolher café">
                {list.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={slugTitle(p.name)}
                    onClick={() => go(i, i > index ? 1 : -1)}
                    className="relative h-1 w-5 overflow-hidden bg-cream/20 sm:w-6 md:w-8"
                  >
                    {i === index && (
                      <motion.span
                        key={`${p.id}-${hover || hidden ? "p" : "r"}`}
                        className="absolute inset-y-0 left-0 bg-jungle"
                        initial={{ width: reduce || hover || hidden ? "100%" : "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: reduce || hover || hidden ? 0 : INTERVAL / 1000, ease: "linear" }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <span className="label shrink-0 text-cream/50 tabular-nums">
                {pad(index + 1)} / {pad(total)}
              </span>
            </div>
          )}
        </Reveal>

        <Reveal delay={0.12}>
          <SectionLabel className="text-cream/60" index="03">Lote em destaque</SectionLabel>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={hero?.id ?? "vazio"}
              initial={{ opacity: 0, y: reduce ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -10 }}
              transition={{ duration: 0.4, ease: EASE }}
              aria-live="polite"
            >
              <h2 className="display mt-6 text-[11vw] leading-[0.85] md:min-h-[1.7em] md:text-[6vw]">
                {hero ? slugTitle(hero.name) : "Destaque"}
              </h2>
              <p className="mt-6 max-w-md text-[15px] text-cream/70 md:min-h-[3em]">
                {hero?.flavor ?? hero?.aroma
                  ?? "Um lote de fermentação controlada com doçura alta e final longo."}
              </p>

              <dl className="mt-10 grid grid-cols-2 gap-px border border-ink-line bg-ink-line">
                {[
                  { icon: Leaf, k: "Variedade", v: hero?.variety, tone: "text-mosaic-lime" },
                  { icon: Mountain, k: "Altitude", v: hero?.altitude, tone: "text-mosaic-blue" },
                  { icon: Timer, k: "Processo", v: hero?.process, tone: "text-mosaic-yellow" },
                  { icon: Coffee, k: "Corpo", v: hero?.bodyNote, tone: "text-mosaic-green" },
                ].map(({ icon: Icon, k, v, tone }) => (
                  <div key={k} className="bg-ink p-5">
                    <Icon className={cn("size-4", tone)} strokeWidth={1.4} />
                    <dt className="label mt-3 text-muted">{k}</dt>
                    <dd className="mt-1 text-sm text-cream/85">{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>

              {hero && (
                <div className="mt-10 flex flex-wrap items-center gap-6">
                  <span className="display text-3xl">{brl(hero.priceCents)}</span>
                  <Link
                    to={`/cafe/${hero.slug}`}
                    className="group label flex items-center gap-4 bg-jungle py-4 pr-4 pl-7 text-cream transition-colors hover:bg-jungle-lit"
                  >
                    Ver o lote
                    <ArrowCircle size="sm" className="border-cream/40" />
                  </Link>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </Reveal>
      </div>
    </section>
  );
}
