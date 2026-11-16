import { useState } from "react";
import { Instagram, MapPin, Mail, MessageCircle } from "lucide-react";
import { useCreateLead } from "../queries/leads";
import { Field, SectionLabel, Spinner } from "../components/primitives";
import {
  ADDRESS,
  EMAIL,
  INSTAGRAM,
  INSTAGRAM_HANDLE,
  PHONE_LABEL,
  WHATSAPP,
} from "../components/layout";
import { maskPhone } from "../lib/format";
import { breadcrumb, useSeo } from "../lib/seo";

export default function Contato() {
  const lead = useCreateLead();
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sent, setSent] = useState(false);

  useSeo({
    title: "Contato",
    description:
      "Fale com a Kalango Cafés Especiais: WhatsApp (61) 99593-7582, kalangocafe@gmail.com e a torrefação no Lago Norte, Brasília-DF.",
    path: "/contato",
    jsonLd: [breadcrumb([{ name: "Início", path: "/" }, { name: "Contato", path: "/contato" }])],
  });

  return (
    <>
      <section className="grain relative overflow-hidden bg-ink pt-40 pb-16 text-cream md:pt-48">
        <div className="shell relative">
          <SectionLabel className="text-cream/70" index="CONTATO">
            Respondemos em até 1 dia útil
          </SectionLabel>
          <h1 className="display mt-8 text-[13vw] leading-[0.86] md:text-[10vw]">Fale com a gente</h1>
        </div>
      </section>

      <section className="shell grid gap-16 py-20 lg:grid-cols-[1fr_0.8fr] md:py-28">
        <div>
          {sent
            ? (
              <div className="border border-ink/15 p-10">
                <h2 className="display text-4xl">Mensagem enviada</h2>
                <p className="mt-4 text-sm text-muted">
                  Obrigado, {form.name.split(" ")[0]}. Retornamos no e-mail informado.
                </p>
              </div>
            )
            : (
              <form
                className="grid gap-8 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  lead.mutate({ kind: "contato", ...form }, { onSuccess: () => setSent(true) });
                }}
              >
                <Field
                  label="Nome"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Field
                  label="E-mail"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Field
                  label="WhatsApp"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                />
                <div className="sm:col-span-2">
                  <span className="label text-muted">Mensagem</span>
                  <textarea
                    required
                    aria-label="Mensagem"
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="mt-2 w-full resize-none border-b border-ink/20 bg-transparent pb-2 outline-none focus:border-jungle"
                  />
                </div>
                <button
                  type="submit"
                  disabled={lead.isPending}
                  className="label flex items-center justify-center gap-3 bg-ink px-8 py-4 text-cream transition-colors hover:bg-jungle disabled:opacity-60 sm:col-span-2"
                >
                  {lead.isPending && <Spinner />}
                  Enviar mensagem
                </button>
                {lead.isError && (
                  <p className="text-sm text-red-700 sm:col-span-2">
                    Não foi possível enviar agora. Tente pelo WhatsApp.
                  </p>
                )}
              </form>
            )}
        </div>

        <aside className="space-y-8 border-l border-ink/10 pl-0 lg:pl-12">
          {[
            { icon: MessageCircle, k: "WhatsApp", v: PHONE_LABEL, href: WHATSAPP },
            {
              icon: Mail,
              k: "E-mail",
              v: EMAIL,
              href: `mailto:${EMAIL}`,
            },
            {
              icon: MapPin,
              k: "Torrefação",
              v: ADDRESS,
              href:
                "https://www.google.com/maps/search/?api=1&query=SHIN+CA3+Lotes+33%2F34+loja+7+Lago+Norte+Brasilia+DF",
            },
            {
              icon: Instagram,
              k: "Instagram",
              v: INSTAGRAM_HANDLE,
              href: INSTAGRAM,
            },
          ].map(({ icon: Icon, k, v, href }) => (
            <div key={k}>
              <Icon className="size-5 text-jungle" strokeWidth={1.4} />
              <p className="label mt-3 text-muted">{k}</p>
              {href
                ? (
                  <a href={href} className="link-underline text-[15px] hover:text-jungle">
                    {v}
                  </a>
                )
                : <p className="text-[15px]">{v}</p>}
            </div>
          ))}
        </aside>
      </section>
    </>
  );
}
