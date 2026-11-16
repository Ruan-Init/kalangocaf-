export function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Parcelamento: até 3x no cartão, com juros definidos pela conta Mercado Pago.
 * Não mostramos valor de parcela nem "sem juros" — quem calcula é o Mercado Pago.
 */
export function installmentsNote() {
  return "Até 3x no cartão · condições e juros no Mercado Pago";
}

export function slugTitle(name: string) {
  return name.replace(/\s*250g\s*$/i, "").trim();
}

export function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

export function maskCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
}

export function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
