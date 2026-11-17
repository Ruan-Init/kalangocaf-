/* ARIA drop-zone contains a file input; nested controls are invalid in a native button. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
/**
 * Caixa de fotos do painel: arrastar e soltar (ou clicar) para enviar.
 * Cada foto é reduzida no navegador (lado maior até MAX_SIDE, WebP/JPEG) e
 * enviada ao storage pelo servidor. Devolve a lista de URLs públicas.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Spinner } from "./primitives";

const MAX_SIDE = 1800;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;
type Accepted = (typeof ACCEPT)[number];

/** Reduz fotos grandes. GIF vai como está (perderia a animação). */
async function prepare(file: File): Promise<{ blob: Blob; type: Accepted; name: string }> {
  const type = file.type as Accepted;
  if (type === "image/gif") return { blob: file, type, name: file.name };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) {
      bmp.close();
      return { blob: file, type, name: file.name };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const toBlob = (t: string) =>
      new Promise<Blob | null>((ok) => canvas.toBlob(ok, t, 0.86));
    let out = await toBlob("image/webp");
    if (!out || out.type !== "image/webp") out = await toBlob("image/jpeg");
    if (!out) return { blob: file, type, name: file.name };
    return { blob: out, type: out.type as Accepted, name: file.name };
  } catch {
    return { blob: file, type, name: file.name };
  }
}

type Pending = { id: string; name: string; preview: string; error?: string };

export function ImageDrop({
  token,
  value,
  onChange,
  max = 10,
  onBusyChange,
  folder = "lifestyle",
}: {
  token: string;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  /** true enquanto alguma foto ainda está subindo. */
  onBusyChange?: (busy: boolean) => void;
  /** Pasta no storage. */
  folder?: "lifestyle" | "cafes";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  // Mantém a lista mais recente para uploads que terminam fora de ordem.
  const latest = useRef(value);
  latest.current = value;
  const busy = pending.some((p) => !p.error);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const send = async (files: File[]) => {
    setErro(null);
    const ok = files.filter((f) => (ACCEPT as readonly string[]).includes(f.type));
    if (ok.length < files.length) setErro("Só fotos JPG, PNG, WebP, GIF ou AVIF.");
    const room = max - latest.current.length - pending.length;
    if (room <= 0) return setErro(`Limite de ${max} fotos por produto.`);
    const batch = ok.slice(0, room);
    if (ok.length > room) setErro(`Limite de ${max} fotos: enviei só as ${room} primeiras.`);

    await Promise.all(
      batch.map(async (file) => {
        const id = crypto.randomUUID();
        const preview = URL.createObjectURL(file);
        setPending((p) => [...p, { id, name: file.name, preview }]);
        try {
          const { blob, name } = await prepare(file);
          const form = new FormData();
          form.append("file", blob, name);
          form.append("folder", folder);
          const res = await fetch("/api/admin/upload-photo", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          let result: unknown;
          try {
            result = await res.json();
          } catch {
            throw new Error(`Resposta inválida do servidor (${res.status}).`);
          }
          if (!res.ok) {
            const message =
              typeof result === "object" &&
              result !== null &&
              "error" in result &&
              typeof result.error === "string"
                ? result.error
                : `Falha no envio (${res.status}).`;
            throw new Error(message);
          }
          if (
            typeof result !== "object" ||
            result === null ||
            !("publicUrl" in result) ||
            typeof result.publicUrl !== "string"
          ) {
            throw new Error("Resposta inválida do servidor.");
          }
          const publicUrl = result.publicUrl;
          latest.current = [...latest.current, publicUrl];
          onChange(latest.current);
          setPending((p) => p.filter((x) => x.id !== id));
          URL.revokeObjectURL(preview);
        } catch (err) {
          setPending((p) =>
            p.map((x) => (x.id === id ? { ...x, error: (err as Error).message || "Falhou" } : x))
          );
        }
      })
    );
  };

  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = (i: number) => onChange(value.filter((_, k) => k !== i));

  const vazio = value.length === 0 && pending.length === 0;

  return (
    <div>
      {/* ARIA drop zone contains a file input: a native button cannot contain another control. */}
      {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Soltar ou escolher fotos"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send([...e.dataTransfer.files]);
        }}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.length) void send(files);
        }}
        className={cn(
          "mt-2 flex cursor-pointer flex-col items-center justify-center gap-3 border border-dashed px-6 text-center transition-colors outline-none focus-visible:border-jungle",
          vazio ? "min-h-56 py-10" : "py-6",
          over ? "border-jungle bg-jungle/10 text-cream" : "border-cream/25 text-cream/45 hover:border-cream/50"
        )}
      >
        <ImagePlus className={cn("size-6", over ? "text-jungle" : "text-cream/35")} strokeWidth={1.4} />
        <p className="text-sm">
          {over ? "Solte para enviar" : "Arraste as fotos pra cá ou clique para escolher"}
        </p>
        <p className="text-xs text-cream/30">JPG, PNG, WebP · até {max} fotos · a primeira é a capa</p>
        <input
          ref={input}
          aria-label="Selecionar fotos do produto"
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          hidden
          onChange={(e) => {
            void send([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {!vazio && (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {value.map((src, i) => (
            <li key={src} className="group relative aspect-square overflow-hidden border border-cream/15 bg-cream/5">
              <img src={src} alt={`Foto ${i + 1}`} className="size-full object-cover" />
              {i === 0 && (
                <span className="label absolute top-1.5 left-1.5 bg-jungle px-1.5 py-0.5 text-[8px] text-ink">Capa</span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/80 p-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <div className="flex">
                  <button type="button" aria-label="Mover para a esquerda" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-7 place-items-center text-cream/70 hover:text-cream disabled:opacity-25">
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <button type="button" aria-label="Mover para a direita" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="grid size-7 place-items-center text-cream/70 hover:text-cream disabled:opacity-25">
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
                <button type="button" aria-label="Remover foto" onClick={() => remove(i)} className="grid size-7 place-items-center text-cream/70 hover:text-red">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.id} className="relative aspect-square overflow-hidden border border-cream/15">
              <img src={p.preview} alt={p.name} className="size-full object-cover opacity-40" />
              <div className="absolute inset-0 grid place-items-center p-2 text-center">
                {p.error ? (
                  <div>
                    <p className="text-[11px] text-red">{p.error}</p>
                    <button type="button" onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))} className="label mt-1 text-[8px] text-cream/60 underline">
                      Descartar
                    </button>
                  </div>
                ) : (
                  <Spinner />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="mt-2 text-xs text-red">{erro}</p>}
    </div>
  );
}
