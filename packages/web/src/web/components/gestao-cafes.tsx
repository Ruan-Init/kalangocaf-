/**
 * Aba "Cafés" do painel /gestao — no mesmo molde da aba Lifestyle.
 *
 * Cafés podem ser criados aqui ou importados do Bling. Nos vinculados,
 * os dados comerciais vêm do ERP; fotos e ficha são sempre editadas aqui.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, RefreshCw, Star, Trash2, X } from "lucide-react";
import { brl, slugTitle } from "../lib/format";

const nome = (n: string) => slugTitle(n).replace(/[()]/g, "").replace(/\s+/g, " ").trim();
import { cn } from "../lib/utils";
import { Spinner } from "./primitives";
import { useAdminCoffees, useRemoveCoffee, useSaveCoffee } from "../queries/admin";
import { useBlingSync } from "../queries/bling";
import { ImageDrop } from "./image-drop";
import { ProductPublication } from "./product-publication";

type CoffeeRow = NonNullable<ReturnType<typeof useAdminCoffees>["data"]>[number];

const CAMPO =
  "mt-2 w-full border-b border-cream/25 bg-transparent pb-2 text-sm outline-none placeholder:text-cream/25 focus:border-jungle";
const AREA =
  "mt-2 w-full resize-y border border-cream/20 bg-transparent p-3 text-sm outline-none focus:border-jungle";

function listaDe(texto: string) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugify(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  list,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
  inputMode?: "decimal";
}) {
  return (
    <div>
      <label htmlFor={id} className="label block text-cream/45">{label}</label>
      <input
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={list}
        inputMode={inputMode}
        className={CAMPO}
      />
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="label mb-4 text-jungle">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function Formulario({
  token,
  row,
  familias,
  onDone,
}: {
  token: string;
  row: CoffeeRow | null;
  familias: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const save = useSaveCoffee();
  const vinculado = row?.blingId != null || Boolean(row?.productAttempted);
  const [creationKey] = useState(() => row?.creationKey ?? crypto.randomUUID());
  const [slugManual, setSlugManual] = useState(Boolean(row));
  const [familia, ...tags] = row?.notes ?? [];
  const [form, setForm] = useState(() => ({
    name: row?.name ?? "",
    slug: row?.slug ?? "",
    description: row?.description ?? "",
    price: row ? String(row.priceCents / 100).replace(".", ",") : "",
    stock: row?.stock ?? 0,
    weightGrams: row?.weightGrams ?? 250,
    active: row?.active ?? true,
    family: familia ?? "",
    notes: tags.join(", "),
    shortDescription: row?.shortDescription ?? "",
    story: row?.story ?? "",
    variety: row?.variety ?? "",
    altitude: row?.altitude ?? "",
    process: row?.process ?? "",
    producer: row?.producer ?? "",
    origin: row?.origin ?? "",
    roast: row?.roast ?? "",
    aroma: row?.aroma ?? "",
    flavor: row?.flavor ?? "",
    acidity: row?.acidity ?? "",
    bodyNote: row?.bodyNote ?? "",
    finish: row?.finish ?? "",
    scaScore: row?.scaScore != null ? String(row.scaScore).replace(".", ",") : "",
    images: row?.images ?? [],
    featured: row?.featured ?? false,
    position: row?.position ?? 0,
  }));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    void ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const limpo = form.price.trim().replace(/\s/g, "").replace("R$", "");
    const preco = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
    if (!vinculado) {
      if (form.name.trim().length < 2) return setErro("Dê um nome para o café.");
      if (!/^[a-z0-9-]{2,80}$/.test(form.slug.trim())) return setErro("Endereço inválido. Use letras minúsculas, números e hífen.");
      if (!limpo || !Number.isFinite(preco) || preco <= 0) return setErro("Preço inválido. Use algo como 49,90.");
      if (!Number.isInteger(form.stock) || form.stock < 0) return setErro("Estoque deve ser um número inteiro maior ou igual a zero.");
      if (!Number.isInteger(form.weightGrams) || form.weightGrams < 1 || form.weightGrams > 30000) return setErro("Peso inválido. Use de 1 a 30.000 gramas.");
    }
    let sca: number | null = null;
    if (form.scaScore.trim()) {
      sca = Number(form.scaScore.trim().replace(",", "."));
      if (!Number.isFinite(sca) || sca < 0 || sca > 100) return setErro("Pontuação SCA inválida. Use algo como 86,5.");
    }
    const notes = [form.family.trim(), ...listaDe(form.notes)].filter(Boolean);
    if (!form.family.trim() && listaDe(form.notes).length) {
      return setErro("Preencha a família: ela é a primeira etiqueta do card e o filtro da loja.");
    }

    save.mutate(
      {
        token,
        item: {
          id: row?.id,
          creationKey,
          ...(!vinculado ? {
            name: form.name.trim(),
            slug: form.slug.trim(),
            description: form.description,
            priceCents: Math.round(preco * 100),
            stock: form.stock,
            weightGrams: form.weightGrams,
            active: form.active,
          } : {}),
          shortDescription: form.shortDescription,
          story: form.story,
          variety: form.variety,
          altitude: form.altitude,
          process: form.process,
          producer: form.producer,
          origin: form.origin,
          roast: form.roast,
          aroma: form.aroma,
          flavor: form.flavor,
          acidity: form.acidity,
          bodyNote: form.bodyNote,
          finish: form.finish,
          scaScore: sca,
          notes,
          images: form.images,
          featured: form.featured,
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
    <form ref={ref} onSubmit={submit} className="scroll-mt-6 space-y-9 bg-ink-soft px-5 py-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="display text-2xl leading-none">{row ? nome(row.name) : "Novo café"}</p>
          <p className="mt-2 text-xs text-cream/45">{vinculado ? "Vinculado ao Bling" : "Cadastro pela gestão"} · /cafe/{form.slug || "endereco-do-cafe"}</p>
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onDone}
          className="shrink-0 border border-cream/20 p-2 transition-colors hover:border-jungle hover:text-jungle"
        >
          <X className="size-3.5" strokeWidth={1.6} />
        </button>
      </div>

      <p className="text-xs leading-relaxed text-cream/55">Novo cadastro cria um produto simples no Bling e salva o vínculo. Se falhar, fica como rascunho fora da loja. Estoque positivo exige escolher um depósito na aba Bling.</p>
      {row && <ProductPublication token={token} kind="coffee" row={row} />}
      {vinculado && row ? <div className="border border-cream/12 px-4 py-4">
        <p className="label text-cream/45">Vem do Bling (edite lá)</p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-cream/40">Preço</dt>
            <dd>{brl(row.priceCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-cream/40">Estoque</dt>
            <dd>{row.stock}</dd>
          </div>
          <div>
            <dt className="text-xs text-cream/40">Situação</dt>
            <dd className={row.active ? "text-lime" : "text-cream/50"}>{row.active ? "Ativo" : "Inativo"}</dd>
          </div>
          <div>
            <dt className="text-xs text-cream/40">SKU</dt>
            <dd>{row.sku ?? "—"}</dd>
          </div>
        </dl>
        {row.description && (
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-cream/50">{row.description}</p>
        )}
      </div> : (
        <Bloco titulo="Anúncio do café">
          <div className="grid gap-5 sm:grid-cols-2">
            <Campo id="cf-name" label="Nome do café" value={form.name} onChange={(v) =>
              setForm((f) => ({ ...f, name: v, slug: slugManual ? f.slug : slugify(v) }))} placeholder="Café Kalango Flor de Mel" />
            <Campo id="cf-slug" label="Endereço (slug)" value={form.slug} onChange={(v) => {
              setSlugManual(true); set("slug", v.toLowerCase());
            }} placeholder="cafe-kalango-flor-de-mel" />
            <Campo id="cf-price" label="Preço (R$)" value={form.price} onChange={(v) => set("price", v)} inputMode="decimal" placeholder="49,90" />
            <div>
              <label htmlFor="cf-stock" className="label block text-cream/45">Estoque</label>
              <input id="cf-stock" aria-label="Estoque" type="number" min={0} step={1} value={form.stock} onChange={(e) => set("stock", Number(e.target.value))} className={CAMPO} />
            </div>
            <div>
              <label htmlFor="cf-weight" className="label block text-cream/45">Peso (gramas)</label>
              <input id="cf-weight" aria-label="Peso (gramas)" type="number" min={1} max={30000} step={1} value={form.weightGrams} onChange={(e) => set("weightGrams", Number(e.target.value))} className={CAMPO} />
            </div>
          </div>
          <div>
            <label htmlFor="cf-description" className="label block text-cream/45">Descrição do produto</label>
            <textarea id="cf-description" aria-label="Descrição do produto" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className={AREA} />
          </div>
          <button type="button" aria-pressed={form.active} onClick={() => set("active", !form.active)} className={cn("label flex items-center gap-2 border px-4 py-2.5 text-[9px]", form.active ? "border-jungle/60 text-jungle" : "border-cream/20 text-cream/50")}>
            {form.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {form.active ? "Visível na loja" : "Oculto"}
          </button>
        </Bloco>
      )}

      <div>
        <p className="label block text-cream/45">Fotos</p>
        <ImageDrop
          token={token}
          folder="cafes"
          value={form.images}
          onChange={(imgs) => set("images", imgs)}
          onBusyChange={setEnviando}
        />
        <p className="mt-2 text-xs text-cream/45">
          A primeira é a capa do card na loja. Passe o mouse na foto para mudar a ordem ou remover.
        </p>
      </div>

      <Bloco titulo="Sensorial">
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo
            id="cf-family"
            label="Família"
            value={form.family}
            onChange={(v) => set("family", v)}
            placeholder="Doce & Licoroso"
            list="cf-familias"
          />
          <datalist id="cf-familias">
            {familias.map((f) => <option key={f} value={f} aria-label={f} />)}
          </datalist>
          <Campo
            id="cf-notes"
            label="Notas (separadas por vírgula)"
            value={form.notes}
            onChange={(v) => set("notes", v)}
            placeholder="Chocolate, Caramelo, Nozes"
          />
          <Campo id="cf-acid" label="Acidez" value={form.acidity} onChange={(v) => set("acidity", v)} placeholder="Cítrica" />
          <Campo id="cf-body" label="Corpo" value={form.bodyNote} onChange={(v) => set("bodyNote", v)} placeholder="Amanteigado" />
          <Campo id="cf-aroma" label="Aroma" value={form.aroma} onChange={(v) => set("aroma", v)} />
          <Campo id="cf-flavor" label="Sabor" value={form.flavor} onChange={(v) => set("flavor", v)} />
          <Campo id="cf-finish" label="Finalização" value={form.finish} onChange={(v) => set("finish", v)} />
          <Campo
            id="cf-sca"
            label="Pontuação SCA"
            value={form.scaScore}
            onChange={(v) => set("scaScore", v)}
            placeholder="86,5"
            inputMode="decimal"
          />
        </div>
      </Bloco>

      <Bloco titulo="Ficha técnica">
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo id="cf-var" label="Variedade" value={form.variety} onChange={(v) => set("variety", v)} placeholder="Catuaí 62" />
          <Campo id="cf-alt" label="Altitude" value={form.altitude} onChange={(v) => set("altitude", v)} placeholder="1.100 m" />
          <Campo id="cf-proc" label="Processo" value={form.process} onChange={(v) => set("process", v)} placeholder="Natural" />
          <Campo id="cf-roast" label="Torra" value={form.roast} onChange={(v) => set("roast", v)} placeholder="Torra média" />
          <Campo id="cf-prod" label="Produtor" value={form.producer} onChange={(v) => set("producer", v)} />
          <Campo id="cf-orig" label="Origem" value={form.origin} onChange={(v) => set("origin", v)} placeholder="Fazenda, cidade - UF" />
        </div>
      </Bloco>

      <Bloco titulo="Textos do site">
        <div>
          <label htmlFor="cf-short" className="label block text-cream/45">Frase curta</label>
          <textarea
            id="cf-short"
            aria-label="Frase curta"
            value={form.shortDescription}
            onChange={(e) => set("shortDescription", e.target.value)}
            rows={2}
            className={AREA}
          />
        </div>
        <div>
          <label htmlFor="cf-story" className="label block text-cream/45">História</label>
          <textarea
            id="cf-story"
            aria-label="História do café"
            value={form.story}
            onChange={(e) => set("story", e.target.value)}
            rows={4}
            className={AREA}
          />
        </div>
      </Bloco>

      <div className="flex flex-wrap items-end gap-4">
        <button
          type="button"
          onClick={() => set("featured", !form.featured)}
          className={cn(
            "label flex items-center gap-2 border px-4 py-2.5 text-[9px] transition-colors",
            form.featured ? "border-gold/60 text-gold" : "border-cream/20 text-cream/50"
          )}
        >
          <Star className={cn("size-3.5", form.featured && "fill-current")} strokeWidth={1.6} />
          {form.featured ? "Em destaque na home" : "Sem destaque"}
        </button>
        <div className="w-24">
          <label htmlFor="cf-pos" className="label block text-cream/45">Ordem</label>
          <input
            id="cf-pos"
            aria-label="Ordem de exibição"
            type="number"
            min={0}
            value={form.position}
            onChange={(e) => set("position", Number(e.target.value))}
            className={CAMPO}
          />
        </div>

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
            {enviando ? "Enviando fotos…" : row ? "Salvar alterações" : "Adicionar café"}
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-red">{erro}</p>}
    </form>
  );
}

export function CafesPainel({ token }: { token: string }) {
  const qc = useQueryClient();
  const data = useAdminCoffees(token);
  const sync = useBlingSync();
  const remove = useRemoveCoffee();
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [modo, setModo] = useState<{ tipo: "fechado" } | { tipo: "novo" } | { tipo: "editar"; row: CoffeeRow }>({ tipo: "fechado" });
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = useMemo(() => data.data ?? [], [data.data]);
  const familias = useMemo(
    () => [...new Set(lista.map((r) => r.notes[0]).filter((f): f is string => Boolean(f)))].sort(),
    [lista]
  );

  const sincronizar = () => {
    setAviso(null);
    sync.mutate(
      { token },
      {
        onSuccess: (r) => {
          setAviso(
            r.summary.error
              ? `Sincronização com erro: ${r.summary.error}`
              : `Pronto: ${r.summary.updated.length} atualizado(s), ${r.summary.created.length} novo(s).`
          );
          void qc.invalidateQueries();
        },
        onError: (e) => setAviso(e.message),
      }
    );
  };

  const excluir = (id: number) => {
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
          {lista.length} café(s) · {lista.filter((r) => r.active && ["legacy", "ready"].includes(r.publicationStatus)).length} ativo(s) na loja ·{" "}
          {lista.filter((r) => r.featured).length} em destaque
        </p>
        <button
          type="button"
          onClick={() => setModo(modo.tipo === "novo" ? { tipo: "fechado" } : { tipo: "novo" })}
          className="label ml-auto flex items-center gap-2 border border-jungle bg-jungle px-5 py-2.5 text-[9px] text-ink"
        >
          {modo.tipo === "novo" ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {modo.tipo === "novo" ? "Fechar" : "Novo café"}
        </button>
        <button
          type="button"
          onClick={sincronizar}
          disabled={sync.isPending}
          className="label flex items-center gap-2 border border-jungle px-5 py-2.5 text-[9px] text-jungle disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} strokeWidth={2} />
          Puxar do Bling
        </button>
      </div>
      <p className="-mt-4 text-xs text-cream/45">
        “Novo café” cria e vincula automaticamente no Bling. “Puxar do Bling” atualiza os dados do ERP. Fotos e ficha técnica são editadas aqui.
      </p>
      {aviso && <p className="text-sm text-cream/70">{aviso}</p>}

      {modo.tipo !== "fechado" && (
        <Formulario
          key={modo.tipo === "editar" ? modo.row.id : "novo"}
          token={token}
          row={modo.tipo === "editar" ? modo.row : null}
          familias={familias}
          onDone={() => setModo({ tipo: "fechado" })}
        />
      )}

      <div className="border-t border-cream/10">
        {data.isLoading && <p className="px-5 py-8 text-sm text-cream/45">Carregando cafés…</p>}
        {data.error && !data.isLoading && (
          <p className="px-5 py-8 text-sm text-red">{data.error.message}</p>
        )}
        {!data.isLoading && !data.error && lista.length === 0 && (
          <p className="px-5 py-8 text-sm text-cream/45">Nenhum café ainda. Clique em "Novo café" ou "Puxar do Bling".</p>
        )}

        {lista.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-cream/10 px-5 py-4">
            <img
              src={r.images[0] ?? "/images/brand/kalango-mosaico.png"}
              alt=""
              className="size-12 shrink-0 bg-cream object-cover"
            />
            <span
              className={cn(
                "label hidden w-[86px] shrink-0 border sm:inline-block px-2.5 py-1 text-center text-[9px]",
                !r.active
                  ? "border-cream/20 text-cream/45"
                  : r.stock <= 0
                  ? "border-red/40 text-red/80"
                  : "border-lime/60 text-lime"
              )}
            >
              {!["legacy", "ready"].includes(r.publicationStatus) ? "Rascunho" : !r.active ? "Inativo" : r.stock <= 0 ? "Esgotado" : "À venda"}
            </span>
            <span className="min-w-0 flex-1 basis-32">
              <span className="flex items-center gap-2 truncate text-[15px]">
                {nome(r.name)}
                {r.featured && <Star className="size-3.5 shrink-0 fill-gold text-gold" strokeWidth={1.6} />}
              </span>
              <span className="block truncate text-xs text-cream/45">
                <span className="sm:hidden">{!["legacy", "ready"].includes(r.publicationStatus) ? "Rascunho" : !r.active ? "Inativo" : r.stock <= 0 ? "Esgotado" : "À venda"} · </span>
                {r.blingId != null ? "Bling" : "Gestão"} · {brl(r.priceCents)} · estoque {r.stock} · {r.notes[0] ?? "sem família"} · {r.images.length} foto(s) · ordem{" "}
                {r.position}
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
            <ProductPublication token={token} kind="coffee" row={r} />
            {confirmar === r.id && (
              <fieldset aria-label={`Confirmar exclusão de ${r.name}`} className="w-full min-w-0 space-y-3 border border-red/25 bg-red/5 p-4">
                <p className="text-sm text-cream/80">Excluir o anúncio “{nome(r.name)}”? Esta ação não pode ser desfeita.</p>
                {r.blingId != null && <p className="text-xs leading-relaxed text-gold">O produto não será apagado no Bling. Uma nova sincronização poderá recriar este anúncio.</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={remove.isPending} onClick={() => excluir(r.id)} className="label flex items-center gap-2 border border-red bg-red px-3 py-2 text-[9px] text-cream disabled:opacity-40">
                    {remove.isPending && <Spinner />}
                    {remove.isPending ? "Excluindo…" : "Confirmar exclusão"}
                  </button>
                  <button type="button" disabled={remove.isPending} onClick={() => { setConfirmar(null); remove.reset(); }} className="label border border-cream/20 px-3 py-2 text-[9px] text-cream/60 disabled:opacity-40">Cancelar</button>
                </div>
                {remove.error && <p role="alert" className="text-sm text-red">{remove.error.message}</p>}
              </fieldset>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
