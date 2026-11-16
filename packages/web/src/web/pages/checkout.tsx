import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { FlaskConical, Lock } from "lucide-react";
import { useCart } from "../lib/cart";
import { brl, maskCep, maskCpf, maskPhone, onlyDigits, installmentsNote } from "../lib/format";
import { Field, SectionLabel, Spinner } from "../components/primitives";
import {
  type Grind,
  useCreateOrder,
  usePaymentConfig,
  useQuote,
  useShippingOptions,
} from "../queries/orders";
import { idempotencyKeyFor, isMercadoPagoUrl, saveOrderToken } from "../lib/order-access";
import { cn } from "../lib/utils";
import { useSeo } from "../lib/seo";

type Form = {
  customerName: string;
  email: string;
  phone: string;
  document: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  notes: string;
};

const EMPTY: Form = {
  customerName: "",
  email: "",
  phone: "",
  document: "",
  zip: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  notes: "",
};

export default function Checkout() {
  const cart = useCart();
  const [, navigate] = useLocation();
  const [form, setForm] = useState<Form>(EMPTY);
  const [shippingServiceId, setShippingServiceId] = useState("");
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "error">("idle");
  useSeo({ title: "Checkout", description: "", path: "/checkout", noindex: true });

  const cep = onlyDigits(form.zip);
  const createOrder = useCreateOrder();
  const payment = usePaymentConfig();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const items = useMemo(
    () => cart.lines.map((l) => ({ slug: l.slug, grind: l.grind as Grind, quantity: l.quantity })),
    [cart.lines]
  );
  const shipping = useShippingOptions(cep, items);
  const options = useMemo(() => shipping.data?.options ?? [], [shipping.data]);
  const quote = useQuote(items, cep, shippingServiceId);

  const set = (k: keyof Form, mask?: (v: string) => string) =>
  (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = mask ? mask(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  // Autopreenche endereço pelo CEP (ViaCEP)
  useEffect(() => {
    const cep = onlyDigits(form.zip);
    if (cep.length !== 8) return;
    let cancelled = false;
    setCepStatus("loading");
    fetch(`https://viacep.com.br/ws/${cep}/json/`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.erro) {
          setCepStatus("error");
          return;
        }
        setCepStatus("idle");
        setForm((f) => ({
          ...f,
          street: data.logradouro || f.street,
          district: data.bairro || f.district,
          city: data.localidade || f.city,
          state: data.uf || f.state,
        }));
      })
      .catch(() => !cancelled && setCepStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [form.zip]);

  // Assim que as opções chegam, marca a mais barata; se o CEP mudou e o serviço
  // escolhido não existe mais na nova cotação, cai de volta pra mais barata.
  useEffect(() => {
    if (options.length === 0) return;
    if (options.some((o) => o.id === shippingServiceId)) return;
    setShippingServiceId(options[0].id);
  }, [options, shippingServiceId]);

  const subtotal = quote.data?.subtotalCents ?? cart.subtotalCents;
  const frete = quote.data?.shippingCents ?? 0;
  const total = quote.data?.totalCents ?? subtotal;

  const missing = quote.data?.missing ?? [];
  const outOfStock = quote.data?.outOfStock ?? [];
  const cartProblem = missing.length > 0
    ? "Um item do carrinho não está mais disponível. Remova-o para continuar."
    : outOfStock.length > 0
    ? `Estoque insuficiente: ${outOfStock.join(", ")}.`
    : null;
  const paymentEnv = payment.data?.env;
  const paymentOff = paymentEnv === "disabled" || payment.isError;
  const busy = createOrder.isPending || redirecting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || paymentOff || !paymentEnv) return;
    setSubmitError(null);
    const payload = {
      customerName: form.customerName,
      email: form.email,
      phone: onlyDigits(form.phone),
      document: onlyDigits(form.document),
      zip: onlyDigits(form.zip),
      street: form.street,
      number: form.number,
      complement: form.complement || undefined,
      district: form.district,
      city: form.city,
      state: form.state.toUpperCase(),
      shippingServiceId,
      notes: form.notes || undefined,
      items,
    };
    // Mesmo conteúdo = mesma chave: clicar de novo ou repetir após erro de rede
    // devolve o mesmo pedido em vez de criar outro.
    const idempotencyKey = idempotencyKeyFor(payload);
    try {
      const res = await createOrder.mutateAsync({ ...payload, idempotencyKey });
      saveOrderToken(res.reference, res.accessToken);
      const orderUrl = `/pedido/${res.reference}?t=${encodeURIComponent(res.accessToken)}`;
      // O carrinho só é limpo depois que o pagamento for aprovado (na página do pedido).
      if (res.checkoutUrl && isMercadoPagoUrl(res.checkoutUrl)) {
        setRedirecting(true);
        window.location.assign(res.checkoutUrl);
        return;
      }
      navigate(orderUrl);
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível criar o pedido. Confira os campos e tente de novo."
      );
    }
  }

  if (cart.lines.length === 0 && !busy) {
    return (
      <section className="grain relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-ink py-32 text-center text-cream">
        <p className="display text-6xl">Carrinho vazio</p>
        <p className="max-w-sm text-cream/60">Não dá pra fechar pedido sem café.</p>
        <Link
          to="/loja"
          className="label border border-cream px-8 py-4 transition-colors hover:border-jungle hover:bg-jungle"
        >
          Escolher um café
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="grain relative overflow-hidden bg-ink pt-40 pb-14 text-cream md:pt-48">
        <div className="shell relative">
          <SectionLabel className="text-cream/70" index="—">Finalizar compra</SectionLabel>
          <h1 className="display mt-8 text-[13vw] leading-[0.86] md:text-[8.5vw]">Checkout</h1>
        </div>
      </section>

      {paymentEnv === "test" && (
        <div className="border-b border-ink/15 bg-gold/25">
          <p className="shell flex items-center gap-3 py-4 text-sm">
            <FlaskConical className="size-4 shrink-0" strokeWidth={1.8} />
            <span>
              <strong>Ambiente de teste — use apenas contas e cartões de teste.</strong>{" "}
              Nenhum valor é cobrado de verdade.
            </span>
          </p>
        </div>
      )}

      <form onSubmit={submit} className="shell grid gap-14 py-16 md:py-24 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-14">
          <div>
            <SectionLabel index="01">Seus dados</SectionLabel>
            <div className="mt-8 grid gap-7 md:grid-cols-2">
              <Field
                label="Nome completo"
                required
                autoComplete="name"
                value={form.customerName}
                onChange={set("customerName")}
              />
              <Field
                label="E-mail"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={set("email")}
              />
              <Field
                label="Telefone / WhatsApp"
                required
                inputMode="tel"
                placeholder="(61) 90000-0000"
                value={form.phone}
                onChange={set("phone", maskPhone)}
              />
              <Field
                label="CPF"
                required
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={form.document}
                onChange={set("document", maskCpf)}
              />
            </div>
          </div>

          <div>
            <SectionLabel index="02">Endereço de entrega</SectionLabel>
            <div className="mt-8 grid gap-7 md:grid-cols-6">
              <Field
                label="CEP"
                required
                inputMode="numeric"
                placeholder="00000-000"
                className="md:col-span-2"
                value={form.zip}
                onChange={set("zip", maskCep)}
              />
              <div className="label flex items-end pb-2 text-muted md:col-span-4">
                {cepStatus === "loading" && "Buscando endereço…"}
                {cepStatus === "error" && <span className="text-red">CEP não encontrado</span>}
              </div>
              <Field
                label="Rua"
                required
                className="md:col-span-4"
                value={form.street}
                onChange={set("street")}
              />
              <Field
                label="Número"
                required
                className="md:col-span-2"
                value={form.number}
                onChange={set("number")}
              />
              <Field
                label="Complemento"
                className="md:col-span-3"
                value={form.complement}
                onChange={set("complement")}
              />
              <Field
                label="Bairro"
                required
                className="md:col-span-3"
                value={form.district}
                onChange={set("district")}
              />
              <Field
                label="Cidade"
                required
                className="md:col-span-4"
                value={form.city}
                onChange={set("city")}
              />
              <Field
                label="UF"
                required
                maxLength={2}
                className="md:col-span-2"
                value={form.state}
                onChange={(e) =>
                  setForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
              />
              <Field
                label="Observações do pedido (opcional)"
                className="md:col-span-6"
                value={form.notes}
                onChange={set("notes")}
              />
            </div>
          </div>

          <div>
            <SectionLabel index="03">Entrega</SectionLabel>
            {cep.length !== 8
              ? (
                <p className="mt-8 border border-dashed border-ink/20 px-6 py-8 text-center text-sm text-muted">
                  Informe o CEP acima para calcularmos o frete.
                </p>
              )
              : (
                <div className="mt-8 space-y-3">
                  {shipping.isFetching && options.length === 0 && (
                    <p className="label flex items-center gap-3 px-6 py-5 text-muted">
                      <Spinner /> Calculando frete…
                    </p>
                  )}
                  {options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShippingServiceId(opt.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 border px-6 py-5 text-left transition-colors",
                        shippingServiceId === opt.id
                          ? "border-ink bg-ink text-cream"
                          : "border-ink/15 hover:border-ink"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm">{opt.label}</span>
                        {opt.deliveryDaysMax !== null && (
                          <span
                            className={cn(
                              "label mt-1 block",
                              shippingServiceId === opt.id ? "text-cream/60" : "text-muted"
                            )}
                          >
                            {opt.deliveryDaysMin && opt.deliveryDaysMin !== opt.deliveryDaysMax
                              ? `${opt.deliveryDaysMin} a ${opt.deliveryDaysMax} dias úteis`
                              : `até ${opt.deliveryDaysMax} dias úteis`}
                            {opt.estimated && " • estimativa"}
                          </span>
                        )}
                      </span>
                      <span className="label shrink-0">
                        {opt.cents === 0 ? "Grátis" : brl(opt.cents)}
                      </span>
                    </button>
                  ))}
                  {shipping.data?.source === "fallback" && options.length > 0 && (
                    <p className="text-xs text-muted">
                      Valores estimados — o frete exato é confirmado antes do envio.
                    </p>
                  )}
                </div>
              )}
          </div>

          <div>
            <SectionLabel index="04">Pagamento</SectionLabel>
            <div className="mt-8 border border-ink/15 p-6">
              <p className="flex items-center gap-3 text-sm">
                <Lock className="size-4 text-jungle" strokeWidth={1.6} />
                Pix, cartão de crédito ou débito, conforme disponível no Mercado Pago — pagamento
                feito no ambiente seguro deles.
              </p>
              <p className="mt-3 text-xs text-muted">
                Crédito em até 3 parcelas; condições e eventuais juros aparecem no Mercado Pago
                antes de você confirmar. Ao continuar, geramos o pedido e você vai para a tela de
                pagamento. Nenhum dado de cartão passa pelo nosso servidor.
              </p>
            </div>
          </div>
        </div>

        <aside className="h-fit border border-ink/15 p-8 lg:sticky lg:top-32">
          <SectionLabel index="—">Seu pedido</SectionLabel>
          <div className="mt-8 space-y-5 border-b border-ink/12 pb-6">
            {cart.lines.map((l) => (
              <div key={`${l.slug}-${l.grind}`} className="flex gap-4">
                <img
                  src={l.image ?? "/images/brand/kalango-mosaico.png"}
                  alt={l.name}
                  className="size-16 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="display text-base leading-tight">{l.name}</p>
                  <p className="label mt-1 text-muted">
                    {l.grind} • {l.quantity}x
                  </p>
                </div>
                <span className="text-sm">{brl(l.unitCents * l.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span>{brl(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Frete</span>
              <span>{frete === 0 ? "Grátis" : brl(frete)}</span>
            </div>
          </div>
          <div className="mt-6 flex items-end justify-between border-t border-ink/12 pt-6">
            <span className="label text-muted">Total</span>
            <span className="display text-4xl">{brl(total)}</span>
          </div>
          <p className="mt-2 text-right text-xs text-muted">{installmentsNote()}</p>

          {(submitError || cartProblem || paymentOff) && (
            <p role="alert" className="mt-6 border border-red/40 bg-red/5 p-4 text-xs text-ink/80">
              {submitError ??
                cartProblem ??
                "Pagamento online indisponível no momento. Fale com a gente pelo WhatsApp."}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !shippingServiceId || Boolean(cartProblem) || paymentOff || !paymentEnv}
            className="label mt-8 flex w-full items-center justify-center gap-3 bg-ink px-6 py-4 text-cream transition-colors hover:bg-jungle disabled:opacity-60"
          >
            {busy && <Spinner />}
            {redirecting ? "Abrindo o Mercado Pago…" : "Ir para o pagamento"}
          </button>
          <p className="mt-4 text-center text-xs text-muted">
            Torramos depois que o pagamento é aprovado. Envio em até 2 dias úteis.
          </p>
        </aside>
      </form>
    </>
  );
}
