import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Carrossel de fotos do card lifestyle: arrasta no celular (scroll-snap),
 * setas no desktop e pontinhos para ir direto a uma foto.
 */
export function MerchGallery({ images, alt }: { images: string[]; alt: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const multi = images.length > 1;

  useEffect(() => {
    const el = track.current;
    if (!el || !multi) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
      setIndex(Math.min(Math.max(i, 0), images.length - 1));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [images.length, multi]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = (i + images.length) % images.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section
      className="relative"
      aria-roledescription={multi ? "carrossel" : undefined}
      aria-label={`Fotos — ${alt}`}
    >
      <div
        ref={track}
        className={cn(
          "flex aspect-[4/5] w-full",
          multi && "snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {images.map((src, i) => (
          <img
            key={src}
            src={src}
            alt={multi ? `${alt} — foto ${i + 1} de ${images.length}` : alt}
            loading="lazy"
            draggable={false}
            className={cn(
              "h-full w-full shrink-0 snap-center object-cover",
              !multi && "transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
            )}
          />
        ))}
      </div>

      {multi && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Foto anterior"
            className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 items-center justify-center bg-cream/90 text-ink opacity-0 transition-opacity duration-300 hover:bg-cream focus-visible:opacity-100 group-hover:opacity-100 md:flex"
          >
            <ChevronLeft className="size-5" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Próxima foto"
            className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 items-center justify-center bg-cream/90 text-ink opacity-0 transition-opacity duration-300 hover:bg-cream focus-visible:opacity-100 group-hover:opacity-100 md:flex"
          >
            <ChevronRight className="size-5" strokeWidth={1.8} />
          </button>

          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => go(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "h-1.5 transition-all duration-300",
                  i === index ? "w-6 bg-cream" : "w-1.5 bg-cream/50 hover:bg-cream/80"
                )}
              />
            ))}
          </div>

          <span className="label absolute top-4 right-4 bg-ink/70 px-2.5 py-1 text-cream tabular-nums">
            {index + 1}/{images.length}
          </span>
        </>
      )}
    </section>
  );
}
