import { Link } from "wouter";
import { SectionLabel } from "../components/primitives";
import { useSeo } from "../lib/seo";

export default function NaoEncontrado() {
  useSeo({ title: "Página não encontrada", description: "", path: "/404", noindex: true });

  return (
    <section className="grain relative flex min-h-screen flex-col justify-center overflow-hidden bg-ink py-40 text-cream">
      <div className="absolute -bottom-24 left-1/4 size-[460px] rounded-full bg-jungle/20 blur-[150px]" />
      <div className="shell relative">
        <SectionLabel className="text-cream/70" index="404">Página não encontrada</SectionLabel>
        <h1 className="display mt-8 text-[22vw] leading-[0.78] md:text-[15vw]">
          Sem<br />
          <span className="text-transparent [-webkit-text-stroke:1.5px_#EFE9D0]">café</span>
        </h1>
        <p className="mt-10 max-w-md text-cream/70">
          Esse endereço não existe — ou a xícara já foi. Volta pra loja que lá tem microlote fresco.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/loja"
            className="label border border-cream px-8 py-4 transition-colors hover:bg-jungle hover:border-jungle"
          >
            Ver a loja
          </Link>
          <Link
            to="/"
            className="label border border-cream/25 px-8 py-4 text-cream/70 transition-colors hover:border-cream hover:text-cream"
          >
            Início
          </Link>
        </div>
      </div>
    </section>
  );
}
