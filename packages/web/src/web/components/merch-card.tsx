import { useState } from "react";
import { Check } from "lucide-react";
import type { Merch } from "../../api/database/schema";
import { useCreateLead } from "../queries/leads";
import { brl } from "../lib/format";
import { cn } from "../lib/utils";
import { Field, Spinner } from "./primitives";
import { MerchArt } from "./merch-art";
import { MerchGallery } from "./merch-gallery";

/** Fundo do card por cor da marca. Gold e lime pedem tinta escura pra ter contraste. */
const TONES: Record<string, { bg: string; ink: string; chip: string }> = {
  jungle: { bg: "bg-jungle", ink: "text-cream", chip: "border-cream/30 text-cream/75" },
  ocean: { bg: "bg-ocean", ink: "text-cream", chip: "border-cream/30 text-cream/75" },
  sky: { bg: "bg-sky", ink: "text-ink", chip: "border-ink/25 text-ink/65" },
  lime: { bg: "bg-lime", ink: "text-ink", chip: "border-ink/25 text-ink/65" },
  gold: { bg: "bg-gold", ink: "text-ink", chip: "border-ink/25 text-ink/65" },
  red: { bg: "bg-red", ink: "text-cream", chip: "border-cream/30 text-cream/75" },
};

export function MerchCard({ item }: { item: Merch }) {
  const tone = TONES[item.tone] ?? TONES.jungle;
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [size, setSize] = useState("");
  const [sizeMissing, setSizeMissing] = useState(false);
  const needsSize = item.sizes.length > 0;
  const lead = useCreateLead();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (needsSize && !size) {
      setSizeMissing(true);
      return;
    }
    lead.mutate(
      {
        kind: "lifestyle",
        name: form.name,
        email: form.email,
        message: size ? `Lista de espera: ${item.name} · tamanho ${size}` : `Lista de espera: ${item.name}`,
      },
      { onSuccess: () => setSent(true) }
    );
  };

  return (
    <div className="group">
      <div className={cn("relative overflow-hidden", tone.bg, tone.ink)}>
        {!item.images[0] && (
          <div
            className="pattern-graos pointer-events-none absolute inset-0 opacity-[0.12]"
            aria-hidden="true"
          />
        )}
        {item.images[0]
          ? (
            <MerchGallery images={item.images} alt={item.name} />
          )
          : (
            <div className="relative flex aspect-[4/5] items-center justify-center p-12">
              <MerchArt
                category={item.category}
                className="size-full max-w-[220px] opacity-90 transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
              />
            </div>
          )}
        {!item.released && (
          <span className="label absolute top-4 left-4 bg-ink/85 px-3 py-1.5 text-cream">
            Em breve
          </span>
        )}
      </div>

      <div className="mt-5">
        <h3 className="display text-2xl leading-none md:text-[28px]">{item.name}</h3>
        <p className="mt-2 text-[13px] text-muted">{item.tagline}</p>
        <p className="mt-3 text-base">
          {item.priceCents ? brl(item.priceCents) : <span className="text-muted">Preço em breve</span>}
        </p>

        {needsSize && (
          <fieldset className="mt-4" disabled={sent}>
            <legend className="label text-muted">Tamanho{size ? `: ${size}` : ""}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.sizes.map((s) => (
                <label key={s} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`tamanho-${item.slug}`}
                    value={s}
                    checked={s === size}
                    onChange={() => {
                      setSize(s);
                      setSizeMissing(false);
                    }}
                    aria-label={`Tamanho ${s}`}
                    className="peer sr-only"
                  />
                  <span className="label inline-flex min-w-11 justify-center border border-ink/20 px-3 py-2 text-ink/70 transition-colors peer-checked:border-ink peer-checked:bg-ink peer-checked:text-cream peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-jungle hover:border-ink hover:text-ink">
                    {s}
                  </span>
                </label>
              ))}
            </div>
            {sizeMissing && (
              <p className="mt-2 text-[13px] text-red">Escolha um tamanho para entrar na lista.</p>
            )}
          </fieldset>
        )}

        {sent
          ? (
            <p className="label mt-5 flex items-center gap-2 text-jungle">
              <Check className="size-4" strokeWidth={2} />
              Você está na lista{size ? ` · tamanho ${size}` : ""}
            </p>
          )
          : open
          ? (
            <form className="mt-5 grid gap-5 border-t border-ink/15 pt-5" onSubmit={submit}>
              <Field
                label="Nome"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Seu nome"
              />
              <Field
                label="E-mail"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="voce@email.com"
              />
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={lead.isPending}
                  className="label flex items-center gap-2 bg-ink px-5 py-3 text-cream transition-colors hover:bg-jungle disabled:opacity-60"
                >
                  {lead.isPending && <Spinner />}
                  Quero ser avisado
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="label text-muted transition-colors hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
              {lead.isError && (
                <p className="text-[13px] text-red">Não deu pra enviar. Tente de novo.</p>
              )}
            </form>
          )
          : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="label mt-5 border border-ink/25 px-5 py-3 transition-colors hover:border-ink hover:bg-ink hover:text-cream"
            >
              Avise-me no lançamento
            </button>
          )}
      </div>
    </div>
  );
}
