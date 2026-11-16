/* The inline deletion group retains its ARIA semantics and the original storefront styling. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
/**
 * Aba "Lifestyle" do painel /gestao: boné, caneca, camiseta, chaveiro.
 *
 * Cadastra no Bling com preço obrigatório. Tamanhos são informativos;
 * enquanto "Liberado" estiver desmarcado o item aparece como
 * "em breve" com lista de espera.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Spinner } from "./primitives";
import { useAdminMerch, useRemoveMerch, useSaveMerch } from "../queries/admin";
import { ImageDrop } from "./image-drop";
import { ProductPublication } from "./product-publication";

type MerchRow = NonNullable<ReturnType<typeof useAdminMerch>["data"]>[number];

const CATEGORIAS = [
  { value: "bone", label: "Boné" },
  { value: "caneca", label: "Caneca" },
  { value: "camiseta", label: "Camiseta" },
  { value: "chaveiro", label: "Chaveiro" },
] as const;

const TONS = ["jungle", "ocean", "lime", "gold", "red", "sky"] as const;

const CAMPO =
  "mt-2 w-full border-b border-cream/25 bg-transparent pb-2 text-sm outline-none placeholder:text-cream/25 focus:border-jungle";

function slugify(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "89,90" / "89.90" / "89" → centavos. Vazio → null (ainda sem preço). */
function parsePreco(texto: string): number | null | "invalido" {
  const limpo = texto.trim().replace(/\s/g, "").replace("R$", "");
  if (!limpo) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normal);
  if (!Number.isFinite(n) || n <= 0) return "invalido";
  return Math.round(n * 100);
}

function listaDe(texto: string, separador: RegExp) {
  return texto
    .split(separador)
    .map((s) => s.trim())
    .filter(Boolean);
}

function Formulario({
  token,
  editando,
  onDone,
}: {
  token: string;
  editando: MerchRow | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const save = useSaveMerch();
  const [creationKey] = useState(() => editando?.creationKey ?? crypto.randomUUID());
  const vinculado = editando?.blingId != null || Boolean(editando?.productAttempted);
  const [slugManual, setSlugManual] = useState(Boolean(editando));
  const [form, setForm] = useState(() => ({
    id: editando?.id,
    name: editando?.name ?? "",
    slug: editando?.slug ?? "",
    category: (editando?.category ?? "bone") as string,
    tone: (editando?.tone ?? "jungle") as string,
    tagline: editando?.tagline ?? "",
    description: editando?.description ?? "",
    price: editando?.priceCents != null ? String(editando.priceCents / 100).replace(".", ",") : "",
    sizes: (editando?.sizes ?? []).join(", "),
    images: editando?.images ?? [],
    released: editando?.released ?? false,
    published: editando?.published ?? true,
    position: editando?.position ?? 0,
  }));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const mudarNome = (nome: string) => {
    setForm((f) => ({ ...f, name: nome, slug: slugManual ? f.slug : slugify(nome) }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const preco = parsePreco(form.price);
    if (preco === "invalido" || preco === null) return setErro("Informe um preço maior que zero, inclusive para produtos em breve. Ex.: 89,90.");

    save.mutate(
      {
        token,
        item: {
          id: form.id,
          creationKey,
          name: form.name.trim(),
          slug: form.slug.trim(),
          category: form.category as never,
          tone: form.tone as never,
          tagline: form.tagline.trim() || undefined,
          description: form.description.trim() || undefined,
          priceCents: preco,
          sizes: listaDe(form.sizes, /,/),
          images: form.images,
          released: form.released,
          published: form.published,
          position: Number(form.position) || 0,
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
    <form onSubmit={submit} className="space-y-6 bg-ink-soft px-5 py-6">
      <p className="text-xs leading-relaxed text-cream/55">Novo cadastro cria e vincula um produto simples no Bling, com estoque inicial zero. Preço obrigatório, mesmo “em breve”. Tamanhos são informativos; não criam variantes no ERP.</p>
      {vinculado && <p className="text-xs text-gold">Nome, preço e descrição são controlados pelo Bling após o envio.</p>}
      {editando && <ProductPublication token={token} kind="merch" row={editando} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-name" className="label block text-cream/45">Nome</label>
          <input
            id="lf-name" disabled={vinculado}
            aria-label="Nome do produto"
            value={form.name}
            onChange={(e) => mudarNome(e.target.value)}
            placeholder="Boné Kalango Tucano"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="lf-slug" className="label block text-cream/45">Endereço (slug)</label>
          <input
            id="lf-slug"
            aria-label="Slug do produto"
            value={form.slug}
            onChange={(e) => {
              setSlugManual(true);
              set("slug", e.target.value.toLowerCase());
            }}
            placeholder="bone-kalango-tucano"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="lf-cat" className="label block text-cream/45">Tipo</label>
          <select
            id="lf-cat"
            aria-label="Tipo do produto"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            className={cn(CAMPO, "bg-ink")}
          >
            {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="lf-tone" className="label block text-cream/45">Cor do card</label>
          <select
            id="lf-tone"
            aria-label="Cor do card"
            value={form.tone}
            onChange={(e) => set("tone", e.target.value)}
            className={cn(CAMPO, "bg-ink")}
          >
            {TONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="lf-tag" className="label block text-cream/45">Frase curta</label>
          <input
            id="lf-tag"
            aria-label="Frase curta"
            value={form.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            placeholder="Pra usar na torra de domingo"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="lf-price" className="label block text-cream/45">Preço (R$, obrigatório)</label>
          <input
            id="lf-price" disabled={vinculado}
            aria-label="Preço"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="89,90"
            inputMode="decimal"
            className={CAMPO}
          />
        </div>
      </div>

      <div>
        <label htmlFor="lf-desc" className="label block text-cream/45">Descrição</label>
        <textarea
          id="lf-desc" disabled={vinculado}
          aria-label="Descrição do produto"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="mt-2 w-full resize-y border border-cream/20 bg-transparent p-3 text-sm outline-none focus:border-jungle"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-sizes" className="label block text-cream/45">Tamanhos (separados por vírgula)</label>
          <input
            id="lf-sizes"
            aria-label="Tamanhos"
            value={form.sizes}
            onChange={(e) => set("sizes", e.target.value)}
            placeholder="P, M, G, GG"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor="lf-pos" className="label block text-cream/45">Ordem</label>
          <input
            id="lf-pos"
            aria-label="Ordem de exibição"
            type="number"
            min={0}
            value={form.position}
            onChange={(e) => set("position", Number(e.target.value))}
            className={CAMPO}
          />
        </div>
      </div>

      <div>
        <p className="label block text-cream/45">Fotos</p>
        <ImageDrop
          token={token}
          value={form.images}
          onChange={(imgs) => set("images", imgs)}
          onBusyChange={setEnviando}
        />
        <p className="mt-2 text-xs text-cream/45">
          Sem foto, o card usa a ilustração padrão. Passe o mouse na foto para mudar a ordem ou remover.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => set("released", !form.released)}
          className={cn(
            "label flex items-center gap-2 border px-4 py-2.5 text-[9px] transition-colors",
            form.released ? "border-lime/60 text-lime" : "border-cream/20 text-cream/50"
          )}
        >
          {form.released ? "Liberado para venda" : "Em breve (lista de espera)"}
        </button>
        <button
          type="button"
          onClick={() => set("published", !form.published)}
          className={cn(
            "label flex items-center gap-2 border px-4 py-2.5 text-[9px] transition-colors",
            form.published ? "border-jungle/60 text-jungle" : "border-cream/20 text-cream/50"
          )}
        >
          {form.published
            ? <Eye className="size-3.5" strokeWidth={1.6} />
            : <EyeOff className="size-3.5" strokeWidth={1.6} />}
          {form.published ? "Visível na loja" : "Oculto"}
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
            disabled={save.isPending || enviando}
            className="label flex items-center gap-2 border border-jungle bg-jungle px-5 py-2.5 text-[9px] text-ink transition-opacity disabled:opacity-40"
          >
            {save.isPending || enviando ? <Spinner /> : null}
            {enviando ? "Enviando fotos…" : form.id ? "Salvar alterações" : "Adicionar produto"}
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-red">{erro}</p>}
    </form>
  );
}

export function LifestylePainel({ token }: { token: string }) {
  const qc = useQueryClient();
  const data = useAdminMerch(token);
  const remove = useRemoveMerch();
  const [modo, setModo] = useState<{ tipo: "fechado" } | { tipo: "nova" } | { tipo: "editar"; row: MerchRow }>({
    tipo: "fechado",
  });
  const [confirmar, setConfirmar] = useState<number | null>(null);

  const lista = data.data ?? [];
  const rotulo = (c: string) => CATEGORIAS.find((x) => x.value === c)?.label ?? c;

  const apagar = (id: number) => {
    remove.mutate({ token, id }, {
      onSuccess: () => {
        setConfirmar(null);
        setModo((m) => m.tipo === "editar" && m.row.id === id ? { tipo: "fechado" } : m);
        void qc.invalidateQueries();
      },
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-cream/60">
          {lista.length} item(ns) · {lista.filter((r) => r.published && r.active && ["legacy", "ready"].includes(r.publicationStatus)).length} visível(is) na loja
        </p>
        <button
          type="button"
          onClick={() => setModo(modo.tipo === "nova" ? { tipo: "fechado" } : { tipo: "nova" })}
          className="label ml-auto flex items-center gap-2 border border-jungle bg-jungle px-5 py-2.5 text-[9px] text-ink"
        >
          {modo.tipo === "nova"
            ? <X className="size-3.5" strokeWidth={2} />
            : <Plus className="size-3.5" strokeWidth={2} />}
          {modo.tipo === "nova" ? "Fechar" : "Novo produto"}
        </button>
      </div>

      {modo.tipo !== "fechado" && (
        <Formulario
          key={modo.tipo === "editar" ? modo.row.id : "novo"}
          token={token}
          editando={modo.tipo === "editar" ? modo.row : null}
          onDone={() => setModo({ tipo: "fechado" })}
        />
      )}

      <div className="border-t border-cream/10">
        {data.isLoading && <p className="px-5 py-8 text-sm text-cream/45">Carregando produtos…</p>}
        {data.error && !data.isLoading && (
          <p className="px-5 py-8 text-sm text-red">{data.error.message}</p>
        )}
        {!data.isLoading && !data.error && lista.length === 0 && (
          <p className="px-5 py-8 text-sm text-cream/45">
            Nenhum produto lifestyle cadastrado. Clique em "Novo produto".
          </p>
        )}

        {lista.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-cream/10 px-5 py-5">
            <span
              className={cn(
                "label shrink-0 border px-2.5 py-1 text-[9px]",
                !r.published
                  ? "border-cream/20 text-cream/45"
                  : r.released
                  ? "border-lime/60 text-lime"
                  : "border-gold/50 text-gold"
              )}
            >
              {!["legacy", "ready"].includes(r.publicationStatus) ? "Rascunho" : !r.published || !r.active ? "Oculto" : r.released ? "À venda" : "Em breve"}
            </span>
            <span className="min-w-0 flex-1 basis-32">
              <span className="block truncate text-[15px]">{r.name}</span>
              <span className="block truncate text-xs text-cream/45">
                {rotulo(r.category)} · {r.priceCents != null ? `R$ ${(r.priceCents / 100).toFixed(2).replace(".", ",")}` : "sem preço"}
                {r.sizes.length ? ` · ${r.sizes.join("/")}` : ""} · ordem {r.position} · {r.slug}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Editar ${r.name}`}
              onClick={() => setModo({ tipo: "editar", row: r })}
              disabled={remove.isPending}
              className="shrink-0 border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
            >
              <Pencil className="size-3.5" strokeWidth={1.6} />
            </button>
            <button
              type="button"
              aria-label={`Excluir ${r.name}`}
              disabled={remove.isPending}
              onClick={() => { remove.reset(); setConfirmar(confirmar === r.id ? null : r.id); }}
              className="label flex shrink-0 items-center gap-2 border border-red/40 px-3 py-2 text-[9px] text-red transition-colors hover:border-red disabled:opacity-40"
            >
              <Trash2 className="size-3.5" strokeWidth={1.6} />
              Excluir
            </button>
            <ProductPublication token={token} kind="merch" row={r} />
            {confirmar === r.id && (
              <div role="group" aria-label={`Confirmar exclusão de ${r.name}`} className="w-full space-y-3 border border-red/25 bg-red/5 p-4">
                <p className="text-sm text-cream/80">Excluir o produto “{r.name}”? Esta ação não pode ser desfeita.</p>
                {r.blingId != null && <p className="text-xs text-gold">O produto não será apagado no Bling.</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={remove.isPending} onClick={() => apagar(r.id)} className="label flex items-center gap-2 border border-red bg-red px-3 py-2 text-[9px] text-cream disabled:opacity-40">
                    {remove.isPending && <Spinner />}
                    {remove.isPending ? "Excluindo…" : "Confirmar exclusão"}
                  </button>
                  <button type="button" disabled={remove.isPending} onClick={() => { setConfirmar(null); remove.reset(); }} className="label border border-cream/20 px-3 py-2 text-[9px] text-cream/60 disabled:opacity-40">Cancelar</button>
                </div>
                {remove.error && <p role="alert" className="text-sm text-red">{remove.error.message}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
