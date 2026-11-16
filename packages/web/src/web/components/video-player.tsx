/* Existing brand/preparation clips have no supplied caption track; do not fabricate captions. */
/* eslint-disable jsx-a11y/media-has-caption */
import { useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";

function tempo(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Player com a barra de controles EMBAIXO do vídeo (não por cima), pra não
 * esconder a parte de baixo da imagem — onde fica o preparo do café.
 */
export function VideoPlayer({
  src,
  poster,
  label,
}: {
  src: string;
  poster?: string;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => setCur(v.currentTime);
    const onMeta = () => setDur(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    if (v.readyState >= 1) setDur(v.duration);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = Number(e.target.value);
    setCur(v.currentTime);
  };

  const fullscreen = () => {
    const v = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) void v.requestFullscreen();
    else v.webkitEnterFullscreen?.();
  };

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div ref={wrap} className="bg-ink">
      <div className="relative aspect-video overflow-hidden">
        <video
          ref={ref}
          src={src}
          poster={poster}
          aria-label={label}
          className="size-full cursor-pointer object-contain"
          loop
          playsInline
          muted={muted}
          preload="metadata"
          onClick={toggle}
        />
        {!playing && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Reproduzir vídeo"
            className="absolute inset-0 m-auto flex size-20 items-center justify-center rounded-full bg-ink/60 text-cream backdrop-blur-sm transition-colors hover:bg-jungle"
          >
            <Play className="ml-1 size-8" fill="currentColor" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 border-t border-cream/10 px-4 py-3 text-cream">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pausar" : "Reproduzir"}
          className="shrink-0 hover:text-jungle"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <span className="label shrink-0 tabular-nums text-cream/70">
          {tempo(cur)} / {tempo(dur)}
        </span>
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.1}
          value={cur}
          onChange={seek}
          aria-label="Posição do vídeo"
          className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-jungle"
          style={{
            background: `linear-gradient(to right, var(--color-jungle, #0f9d58) ${pct}%, rgba(239,233,208,0.2) ${pct}%)`,
          }}
        />
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Ativar som" : "Silenciar"}
          className="shrink-0 hover:text-jungle"
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        <button
          type="button"
          onClick={fullscreen}
          aria-label="Tela cheia"
          className="shrink-0 hover:text-jungle"
        >
          <Maximize className="size-5" />
        </button>
      </div>
    </div>
  );
}
