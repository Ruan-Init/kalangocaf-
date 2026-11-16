/**
 * Dados fixos da loja, usados pelo backend (cotação de frete, etiquetas,
 * pedido no ERP, dados estruturados de SEO).
 * Fonte da verdade: confirmados pelo cliente. Não duplicar em outros arquivos.
 */
export const STORE = {
  name: "Kalango Cafés Especiais",
  /** CEP de origem — o Melhor Envio cota o frete a partir daqui. */
  originPostalCode: "71503503",
  originPostalCodeLabel: "71503-503",
  address: {
    street: "SHIN CA3 Lotes 33/34",
    unit: "Loja 7",
    district: "Lago Norte",
    city: "Brasília",
    state: "DF",
    country: "BR",
  },
  phone: "+5561995937582",
  phoneLabel: "+55 61 99593-7582",
  whatsapp: "https://wa.me/5561995937582",
  email: "kalangocafe@gmail.com",
  /** Caixa que o Kalango realmente lê — recebe cópia de cada pedido e responde os automáticos. */
  notificationEmail: "kalangocafe@gmail.com",
  /**
   * Remetente dos e-mails automáticos. O domínio precisa estar verificado no Resend;
   * enquanto não estiver, dá pra apontar MAIL_FROM pro onboarding@resend.dev.
   */
  mailFrom: process.env.EMAIL_FROM ?? process.env.MAIL_FROM ?? "Kalango Cafés Especiais <pedidos@kalangocafe.com.br>",
  instagram: "https://www.instagram.com/kalango_cafe/",
  /** CNPJ informado pelo cliente. Dado público — não é segredo. */
  cnpj: process.env.STORE_CNPJ ?? "49568547000187",
  cnpjLabel: "49.568.547/0001-87",
  /** Peso e dimensões do pacote de 250g, para cotação de frete. */
  package250g: {
    weightKg: 0.3,
    heightCm: 6,
    widthCm: 12,
    lengthCm: 18,
  },
  freeShippingFromCents: 25000,
} as const;
