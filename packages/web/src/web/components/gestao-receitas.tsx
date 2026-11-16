/**
 * Aba "Conheça o seu café" do painel /gestao.
 *
 * Aqui o pessoal da torrefação cola o link do reel do Instagram, escreve o
 * título/descrição e publica. Também edita os textos da página.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Instagram, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Spinner } from "./primitives";
import { ReelEmbed } from "./reel";
import {
  useAdminRecipes,
  useRemoveRecipe,
  useSaveRecipe,
  useSetRecipeTexts,
} from "../queries/recipes";

/** Mesmo regex do servidor — aqui só pra mostrar a prévia antes de salvar. */
function shortcodeOf(url: string) {
  return (
    url.match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? null
  );
}

type RecipeRow = NonNullable<ReturnType<typeof useAdminRecipes>["data"]>["recipes"][number];

const TEXT_FIELDS = [
  { key: "conheca.kicker", label: "Etiqueta do topo", rows: 1 },
  { key: "conheca.titulo", label: "Título grande", rows: 1 },
  { key: "conheca.intro", label: "Parágrafo de abertura", rows: 4 },
  { key: "conheca.cta", label: "Chamada do fim da página", rows: 2 },
] as const;

const VAZIO = {
  id: undefined as number | undefined,
  title: "",
  method: "",
  instagramUrl: "",
  description: "",
  position: 0,
  published: true,
};

function Formulario({
  token,
  editando,
  onDone,
}: {
  token: string;
  editando: RecipeRow | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const save = useSaveRecipe();
  const [form, setForm] = useState(() =>
    editando
      ? {
        id: editando.id,
        title: editando.title,
        method: editando.method,
        instagramUrl: editando.instagramUrl,
        description: editando.description ?? "",
        position: editando.position,
        published: editando.published,
      }
      : VAZIO
  );
  const [erro, setErro] = useState<string | null>(null);

  const preview = shortcodeOf(form.instagramUrl);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!form.title.trim()) return setErro("Escreva um título.");
    if (!preview) return setErro("Cole o link de um reel ou post do Instagram.");

    save.mutate(
      {
        token,
        recipe: {
          id: form.id,
          title: form.title.trim(),
          method: form.method.trim() || "Receita",
          instagramUrl: form.instagramUrl.trim(),
          description: form.description.trim() || undefined,
          position: Number(form.position) || 0,
          published: form.published,
        },
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries();
          onDone();
        },
        onError: (err) => setErro(err.message),
      }
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-8 bg-ink-soft px-5 py-6 md:grid-cols-[1fr_220px]">
      <div className="space-y-5">
        <div>
          <label htmlFor="rec-url" className="label block text-cream/45">
            Link do reel no Instagram
          </label>
          <input
            id="rec-url"
            aria-label="Link do reel no Instagram"
            value={form.instagramUrl}
            onChange={(e) => set("instagramUrl", e.target.value)}
            placeholder="https://www.instagram.com/reel/ABC123/"
            className="mt-2 w-full border-b border-cream/25 bg-transparent pb-2 text-sm outline-none placeholder:text-cream/25 focus:border-jungle"
          />
          {form.instagramUrl && !preview && (
            <p className="mt-2 text-xs text-gold">
              Link não reconhecido. Use o "Copiar link" do próprio reel.
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="rec-title" className="label block text-cream/45">
              Título
            </label>
            <input
              id="rec-title"
              aria-label="Título da receita"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Coado no V60"
              className="mt-2 w-full border-b border-cream/25 bg-transparent pb-2 text-sm outline-none placeholder:text-cream/25 focus:border-jungle"
            />
          </div>
          <div>
            <label htmlFor="rec-method" className="label block text-cream/45">
              Método (etiqueta)
            </label>
            <input
              id="rec-method"
              aria-label="Método da receita"
              value={form.method}
              onChange={(e) => set("method", e.target.value)}
              placeholder="V60, Prensa francesa, Espresso…"
              className="mt-2 w-full border-b border-cream/25 bg-transparent pb-2 text-sm outline-none placeholder:text-cream/25 focus:border-jungle"
            />
          </div>
        </div>

        <div>
          <label htmlFor="rec-desc" className="label block text-cream/45">
            Descrição / receita escrita (opcional)
          </label>
          <textarea
            id="rec-desc"
            aria-label="Descrição da receita"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
            placeholder="15 g de café, 250 ml de água a 92 °C, 2:30 de extração."
            className="mt-2 w-full resize-y border border-cream/20 bg-transparent p-3 text-sm outline-none placeholder:text-cream/25 focus:border-jungle"
          />
        </div>

        <div className="flex flex-wrap items-end gap-6">
          <div className="w-28">
            <label htmlFor="rec-pos" className="label block text-cream/45">
              Ordem
            </label>
            <input
              id="rec-pos"
              aria-label="Ordem de exibição"
              type="number"
              min={0}
              value={form.position}
              onChange={(e) => set("position", Number(e.target.value))}
              className="mt-2 w-full border-b border-cream/25 bg-transparent pb-2 text-sm outline-none focus:border-jungle"
            />
          </div>
          <button
            type="button"
            onClick={() => set("published", !form.published)}
            className={cn(
              "label flex items-center gap-2 border px-4 py-2.5 text-[9px] transition-colors",
              form.published
                ? "border-lime/60 text-lime"
                : "border-cream/20 text-cream/50"
            )}
          >
            {form.published
              ? <Eye className="size-3.5" strokeWidth={1.6} />
              : <EyeOff className="size-3.5" strokeWidth={1.6} />}
            {form.published ? "Publicado" : "Rascunho"}
          </button>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onDone}
              className="label border border-cream/20 px-4 py-2.5 text-[9px] text-cream/60 transition-colors hover:border-cream hover:text-cream"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="label flex items-center gap-2 border border-jungle bg-jungle px-5 py-2.5 text-[9px] text-ink transition-opacity disabled:opacity-40"
            >
              {save.isPending ? <Spinner /> : null}
              {form.id ? "Salvar alterações" : "Publicar receita"}
            </button>
          </div>
        </div>

        {erro && <p className="text-sm text-red">{erro}</p>}
      </div>

      <div>
        <span className="label block text-cream/45">Prévia</span>
        {preview
          ? <ReelEmbed shortcode={preview} title={form.title || "Prévia"} className="mt-2" />
          : (
            <div className="mt-2 flex aspect-[9/15] items-center justify-center border border-dashed border-cream/20 px-4 text-center text-xs text-cream/35">
              Cole o link do reel pra ver o vídeo aqui.
            </div>
          )}
      </div>
    </form>
  );
}

function Textos({
  token,
  atuais,
}: {
  token: string;
  atuais: Record<string, string>;
}) {
  const qc = useQueryClient();
  const salvar = useSetRecipeTexts();
  const [form, setForm] = useState<Record<string, string>>(atuais);
  const [ok, setOk] = useState(false);

  useEffect(() => setForm(atuais), [atuais]);

  const mudou = useMemo(
    () => TEXT_FIELDS.some((f) => (form[f.key] ?? "") !== (atuais[f.key] ?? "")),
    [form, atuais]
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOk(false);
    salvar.mutate(
      { token, texts: form as never },
      {
        onSuccess: () => {
          setOk(true);
          void qc.invalidateQueries();
        },
      }
    );
  };

  return (
    <form onSubmit={submit} className="bg-ink-soft px-5 py-6">
      <span className="label text-jungle">Textos da página</span>
      <p className="mt-2 text-xs text-cream/45">
        Deixe um campo em branco para voltar ao texto padrão.
      </p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key} className={f.rows > 1 ? "md:col-span-2" : ""}>
            <label htmlFor={f.key} className="label block text-cream/45">
              {f.label}
            </label>
            {f.rows > 1
              ? (
                <textarea
                  id={f.key}
                  aria-label={f.label}
                  rows={f.rows}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="mt-2 w-full resize-y border border-cream/20 bg-transparent p-3 text-sm outline-none focus:border-jungle"
                />
              )
              : (
                <input
                  id={f.key}
                  aria-label={f.label}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="mt-2 w-full border-b border-cream/25 bg-transparent pb-2 text-sm outline-none focus:border-jungle"
                />
              )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={salvar.isPending || !mudou}
          className="label flex items-center gap-2 border border-cream/25 px-5 py-2.5 text-[9px] transition-colors hover:border-jungle hover:bg-jungle hover:text-ink disabled:opacity-40"
        >
          {salvar.isPending ? <Spinner /> : null}
          Salvar textos
        </button>
        {ok && !mudou && <span className="text-xs text-lime">Textos salvos.</span>}
        {salvar.error && <span className="text-xs text-red">{salvar.error.message}</span>}
      </div>
    </form>
  );
}

export function ReceitasPainel({ token }: { token: string }) {
  const qc = useQueryClient();
  const data = useAdminRecipes(token);
  const remove = useRemoveRecipe();
  const [modo, setModo] = useState<{ tipo: "fechado" } | { tipo: "nova" } | { tipo: "editar"; row: RecipeRow }>({
    tipo: "fechado",
  });
  const [confirmar, setConfirmar] = useState<number | null>(null);

  const lista = data.data?.recipes ?? [];

  const apagar = (id: number) => {
    remove.mutate({ token, id }, {
      onSuccess: () => {
        setConfirmar(null);
        void qc.invalidateQueries();
      },
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-cream/60">
          {lista.length} receita(s) · {lista.filter((r) => r.published).length} publicada(s)
        </p>
        <button
          type="button"
          onClick={() => setModo(modo.tipo === "nova" ? { tipo: "fechado" } : { tipo: "nova" })}
          className="label ml-auto flex items-center gap-2 border border-jungle bg-jungle px-5 py-2.5 text-[9px] text-ink"
        >
          {modo.tipo === "nova"
            ? <X className="size-3.5" strokeWidth={2} />
            : <Plus className="size-3.5" strokeWidth={2} />}
          {modo.tipo === "nova" ? "Fechar" : "Nova receita"}
        </button>
      </div>

      {modo.tipo !== "fechado" && (
        <Formulario
          key={modo.tipo === "editar" ? modo.row.id : "nova"}
          token={token}
          editando={modo.tipo === "editar" ? modo.row : null}
          onDone={() => setModo({ tipo: "fechado" })}
        />
      )}

      <div className="border-t border-cream/10">
        {data.isLoading && <p className="px-5 py-8 text-sm text-cream/45">Carregando receitas…</p>}
        {data.error && !data.isLoading && (
          <p className="px-5 py-8 text-sm text-red">{data.error.message}</p>
        )}
        {!data.isLoading && !data.error && lista.length === 0 && (
          <p className="px-5 py-8 text-sm text-cream/45">
            Nenhuma receita cadastrada. Clique em "Nova receita" e cole o link do reel.
          </p>
        )}

        {lista.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-cream/10 px-5 py-5">
            <span
              className={cn(
                "label shrink-0 border px-2.5 py-1 text-[9px]",
                r.published ? "border-lime/60 text-lime" : "border-cream/20 text-cream/45"
              )}
            >
              {r.published ? "No ar" : "Rascunho"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{r.title}</span>
              <span className="block truncate text-xs text-cream/45">
                {r.method} · ordem {r.position} · {r.shortcode}
              </span>
            </span>
            <a
              href={r.instagramUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir ${r.title} no Instagram`}
              className="shrink-0 border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
            >
              <Instagram className="size-3.5" strokeWidth={1.6} />
            </a>
            <button
              type="button"
              aria-label={`Editar ${r.title}`}
              onClick={() => setModo({ tipo: "editar", row: r })}
              className="shrink-0 border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
            >
              <Pencil className="size-3.5" strokeWidth={1.6} />
            </button>
            {confirmar === r.id
              ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => apagar(r.id)}
                    disabled={remove.isPending}
                    className="label border border-jungle bg-jungle px-3 py-2 text-[9px] text-ink disabled:opacity-40"
                  >
                    Apagar mesmo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmar(null)}
                    className="label border border-cream/20 px-3 py-2 text-[9px] text-cream/60"
                  >
                    Não
                  </button>
                </span>
              )
              : (
                <button
                  type="button"
                  aria-label={`Apagar ${r.title}`}
                  onClick={() => setConfirmar(r.id)}
                  className="shrink-0 border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.6} />
                </button>
              )}
          </div>
        ))}
      </div>

      {data.data && <Textos token={token} atuais={data.data.texts} />}
    </div>
  );
}
