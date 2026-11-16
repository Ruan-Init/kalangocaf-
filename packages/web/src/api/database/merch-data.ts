/**
 * Linha lifestyle da Kalango — vitrine de pré-lançamento.
 * Preço fica `null` de propósito: nada aqui está à venda ainda, o card mostra
 * "em breve" e coleta lista de espera. Quando o tio fechar preço e estoque,
 * preencha `priceCents` e vire `released: true`.
 */

export type SeedMerch = {
  slug: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  tone: string;
  priceCents: number | null;
  sizes: string[];
  images: string[];
  released: boolean;
  position: number;
};

export const seedMerch: SeedMerch[] = [
  {
    slug: "bone-kalango",
    name: "Boné Kalango",
    category: "bone",
    tagline: "Aba curva, algodão pesado",
    description:
      "Boné de algodão pesado com o kalango bordado na frente e fechamento regulável. Feito pra aguentar sol de cerrado e fila de padaria.",
    tone: "ocean",
    priceCents: null,
    sizes: [],
    images: [
      "/images/lifestyle/bone-kalango.jpg",
      "/images/lifestyle/bone-kalango-2.jpg",
      "/images/lifestyle/bone-kalango-3.jpg",
      "/images/lifestyle/bone-kalango-4.jpg",
    ],
    released: false,
    position: 0,
  },
  {
    slug: "caneca-kalango",
    name: "Caneca Kalango",
    category: "caneca",
    tagline: "Cerâmica 300 ml",
    description:
      "Caneca de cerâmica esmaltada de 300 ml, parede grossa que segura a temperatura do coado. Kalango de um lado, mosaico do outro.",
    tone: "jungle",
    priceCents: null,
    sizes: [],
    images: ["/images/lifestyle/caneca-kalango.jpg"],
    released: false,
    position: 1,
  },
  {
    slug: "camiseta-kalango",
    name: "Camiseta Kalango",
    category: "camiseta",
    tagline: "Algodão penteado, unissex",
    description:
      "Camiseta unissex de algodão penteado com estampa do kalango em silk. Modelagem reta, disponível de P a XG.",
    tone: "lime",
    priceCents: null,
    sizes: ["P", "M", "G", "GG", "XG"],
    images: [
      "/images/lifestyle/camiseta-kalango.jpg",
      "/images/lifestyle/camiseta-kalango-2.jpg",
      "/images/lifestyle/camiseta-kalango-3.jpg",
      "/images/lifestyle/camiseta-kalango-4.jpg",
    ],
    released: false,
    position: 2,
  },
  {
    slug: "chaveiro-kalango",
    name: "Chaveiro Kalango",
    category: "chaveiro",
    tagline: "Acrílico, dupla face",
    description:
      "Chaveiro de acrílico com o kalango impresso em dupla face e argola de aço. Cabe no bolso e vai junto no próximo pacote.",
    tone: "gold",
    priceCents: null,
    sizes: [],
    images: [],
    released: false,
    position: 3,
  },
];
