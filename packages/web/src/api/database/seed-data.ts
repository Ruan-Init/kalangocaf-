/** Dados reais importados da loja atual da Kalango (kalangocafe.com.br). */

export type SeedProduct = {
  slug: string;
  name: string;
  sku: string | null;
  priceCents: number;
  shortDescription: string | null;
  description: string | null;
  story: string | null;
  variety: string | null;
  altitude: string | null;
  process: string | null;
  aroma: string | null;
  flavor: string | null;
  acidity: string | null;
  bodyNote: string | null;
  finish: string | null;
  producer: string | null;
  origin: string | null;
  roast: string;
  scaScore: number | null;
  notes: string[];
  family: string;
  images: string[];
  featured: boolean;
  position: number;
};

export const seedProducts: SeedProduct[] = [
  {
    "slug": "cafe-kalangodoce-cerrado-250g",
    "name": "Doce Cerrado",
    "sku": "00065",
    "priceCents": "6990",
    "shortDescription": "Café Kalango (Doce Cerrado) 250g",
    "description": "Variedade: Novo Mundo\n\nAltitude: 1150 metros\n\nProcesso: Natural fermentado\n\nAroma: Baunilha Avelã e Amêndoas\n\nAcidez: Cítrica\n\nCorpo: Cremoso\n\nProdutor: Ivan Santana\n\nOrigem: Fazenda Jangada, Cabo Verde – MG",
    "story": null,
    "variety": "Novo Mundo",
    "altitude": "1150 metros",
    "process": "Natural fermentado",
    "aroma": "Baunilha Avelã e Amêndoas",
    "flavor": null,
    "acidity": "Cítrica",
    "bodyNote": "Cremoso",
    "finish": null,
    "producer": "Ivan Santana",
    "origin": "Fazenda Jangada, Cabo Verde – MG",
    "roast": "Torra média",
    "scaScore": 84.5,
    "notes": [
      "Baunilha",
      "Avelã",
      "Amêndoas"
    ],
    "family": "Chocolate & Caramelo",
    "images": [
      "/images/products/cafe-kalangodoce-cerrado-250g-pacote.jpg"
    ],
    "featured": false,
    "position": 0
  },
  {
    "slug": "cafe-kalangoalquimia-250g",
    "name": "Alquimia",
    "sku": "00067",
    "priceCents": "9500",
    "shortDescription": "Café Kalango (Alquimia) 250g",
    "description": "Variedade: Bourbon Amarelo\n\nAltitude: 1099 metros\n\nProcesso: Natural fermentado\n\nAroma: Jambo, Mamão e Baunilha\n\nAcidez: Cítrica e Málica\n\nCorpo: Sedoso\n\nProdutor: Gabriel Lamounier\n\nOrigem: Santo ANtonio do Amparo – MG",
    "story": null,
    "variety": "Bourbon Amarelo",
    "altitude": "1099 metros",
    "process": "Natural fermentado",
    "aroma": "Jambo, Mamão e Baunilha",
    "flavor": null,
    "acidity": "Cítrica e Málica",
    "bodyNote": "Sedoso",
    "finish": null,
    "producer": "Gabriel Lamounier",
    "origin": "Santo ANtonio do Amparo – MG",
    "roast": "Torra média",
    "scaScore": 87.0,
    "notes": [
      "Jambo",
      "Mamão",
      "Baunilha"
    ],
    "family": "Frutado",
    "images": [
      "/images/products/cafe-kalangoalquimia-250g-pacote.jpg",
      "/images/products/cafe-kalangoalquimia-250g-1.webp"
    ],
    "featured": false,
    "position": 1
  },
  {
    "slug": "cafe-kalango-garapa-250g",
    "name": "Garapa",
    "sku": "00064",
    "priceCents": "9500",
    "shortDescription": "Café Kalango Garapa– pacote 250g",
    "description": "Variedade: Bourbon Amarelo\n\nAltitude: 1150 metros\n\nProcesso: Natural fermentado\n\nAroma: Curau de milho, garapa e frutas amarelas\n\nAcidez: Cítrica\n\nCorpo: Licoroso\n\n \n\n \n\nProdutor: Ivan Santana\n\nOrigem: Fazenda Jangada, Cabo Verde – MG",
    "story": null,
    "variety": "Bourbon Amarelo",
    "altitude": "1150 metros",
    "process": "Natural fermentado",
    "aroma": "Curau de milho, garapa e frutas amarelas",
    "flavor": null,
    "acidity": "Cítrica",
    "bodyNote": "Licoroso",
    "finish": null,
    "producer": "Ivan Santana",
    "origin": "Fazenda Jangada, Cabo Verde – MG",
    "roast": "Torra média",
    "scaScore": 86.5,
    "notes": [
      "Curau de milho",
      "Garapa",
      "Frutas amarelas"
    ],
    "family": "Doce & Licoroso",
    "images": [
      "/images/products/cafe-kalango-garapa-250g-pacote.jpg",
      "/images/products/cafe-kalango-garapa-250g-1.webp"
    ],
    "featured": false,
    "position": 2
  },
  {
    "slug": "cafe-kalango-arara-roxa-250g",
    "name": "Arara Roxa",
    "sku": "00062",
    "priceCents": "9500",
    "shortDescription": "Café Kalango Arara Roxa– pacote 250g",
    "description": "Variedade: Arara\n\nAltitude: 1200 metros\n\nProcesso: Natural fermentado\n\nAroma: Frutas roxas e mel\n\nAcidez: Tartárica\n\nCorpo: Delicado\n\nProdutor: Jean Vilhena Faleiros\n\nOrigem: Fazenda Santa Mônica, Ibiraci – MG",
    "story": null,
    "variety": "Arara",
    "altitude": "1200 metros",
    "process": "Natural fermentado",
    "aroma": "Frutas roxas e mel",
    "flavor": null,
    "acidity": "Tartárica",
    "bodyNote": "Delicado",
    "finish": null,
    "producer": "Jean Vilhena Faleiros",
    "origin": "Fazenda Santa Mônica, Ibiraci – MG",
    "roast": "Torra média",
    "scaScore": 87.5,
    "notes": [
      "Frutas roxas",
      "Mel"
    ],
    "family": "Frutado",
    "images": [
      "/images/products/cafe-kalango-arara-roxa-250g-pacote.jpg",
      "/images/products/cafe-kalango-arara-roxa-250g-1.jpeg",
      "/images/products/cafe-kalango-arara-roxa-250g-2.webp"
    ],
    "featured": false,
    "position": 3
  },
  {
    "slug": "cafe-kalango-elixir-250g",
    "name": "Elixir",
    "sku": "00063",
    "priceCents": "9500",
    "shortDescription": "Café Kalango Elixir– pacote 250g",
    "description": "Variedade: Arara\n\nAltitude: 1200 metros\n\nProcesso: Natural fermentado\n\nAroma: Laranja, acerola e rum\n\nAcidez: Cítrica\n\nCorpo: Delicado\n\n \n\n \n\nProdutor: Jean Vilhena Faleiros\n\nOrigem: Fazenda Santa Mônica, Ibiraci – MG",
    "story": null,
    "variety": "Arara",
    "altitude": "1200 metros",
    "process": "Natural fermentado",
    "aroma": "Laranja, acerola e rum",
    "flavor": null,
    "acidity": "Cítrica",
    "bodyNote": "Delicado",
    "finish": null,
    "producer": "Jean Vilhena Faleiros",
    "origin": "Fazenda Santa Mônica, Ibiraci – MG",
    "roast": "Torra média",
    "scaScore": 86.0,
    "notes": [
      "Laranja",
      "Acerola",
      "Rum"
    ],
    "family": "Cítrico",
    "images": [
      "/images/products/cafe-kalango-elixir-250g-pacote.jpg",
      "/images/products/cafe-kalango-elixir-250g-1.webp"
    ],
    "featured": false,
    "position": 4
  },
  {
    "slug": "cafe-kalango-dama-da-noite-250g-2",
    "name": "Dama da Noite",
    "sku": "00051",
    "priceCents": "9500",
    "shortDescription": "Café Dama da Noite– pacote 250g",
    "description": "Variedade: Paraiso\n\nAltitude: 1099 metros\n\nProcesso: Natural Fermentado Anaeróbico e Aeróbico\n\nAroma: Doce Floral\n\nSabor:\n\nFavo de Mel, Doce de Leite, Dama da Noite e Chá de Rosas Brancas\n\nAcidez: Cítrica\n\nCorpo: Sedoso\n\nFinalização: Longa\n\nProdutor: Gabriel Lamounier",
    "story": null,
    "variety": "Paraiso",
    "altitude": "1099 metros",
    "process": "Natural Fermentado Anaeróbico e Aeróbico",
    "aroma": "Doce Floral",
    "flavor": null,
    "acidity": "Cítrica",
    "bodyNote": "Sedoso",
    "finish": "Longa",
    "producer": "Gabriel Lamounier",
    "origin": null,
    "roast": "Torra média",
    "scaScore": 88.0,
    "notes": [
      "Favo de mel",
      "Doce de leite",
      "Chá de rosas"
    ],
    "family": "Floral",
    "images": [
      "/images/products/cafe-kalango-dama-da-noite-250g-2-pacote.jpg",
      "/images/products/cafe-kalango-dama-da-noite-250g-2-1.jpg",
      "/images/products/cafe-kalango-dama-da-noite-250g-2-2.webp"
    ],
    "featured": true,
    "position": 5
  },
  {
    "slug": "cafe-kalango-salvia-maravilha-250g",
    "name": "Sálvia Maravilha",
    "sku": "00045",
    "priceCents": "9500",
    "shortDescription": "Café Sálvia Maravilha – pacote 250g",
    "description": null,
    "story": null,
    "variety": null,
    "altitude": null,
    "process": null,
    "aroma": null,
    "flavor": null,
    "acidity": "Cítrica",
    "bodyNote": "Licoroso",
    "finish": null,
    "producer": null,
    "origin": null,
    "roast": "Torra média",
    "scaScore": 86.0,
    "notes": [
      "Floral",
      "Sálvia",
      "Doce"
    ],
    "family": "Floral",
    "images": [
      "/images/products/cafe-kalango-salvia-maravilha-250g-pacote.jpg",
      "/images/products/cafe-kalango-salvia-maravilha-250g-1.webp"
    ],
    "featured": false,
    "position": 6
  },
  {
    "slug": "cafe-kalango-flor-de-mel-250g",
    "name": "Flor de Mel",
    "sku": "00039",
    "priceCents": "7000",
    "shortDescription": "Café flor de mel – pacote 250g",
    "description": "Na região privilegiada do Cerrado Goiano, a Fazenda Nossa Senhora de Fátima, sob os cuidados dedicados de Cristiane Zancanaro, cultiva a joia rara que é o Catuaí Vermelho, a 1.000 metros de altitude. Este café especial, processado com o exclusivo método “sprouting” por 240 horas, apresenta uma complexidade única.\n\nAo aproximar-se, o aroma doce e frutado envolve os sentidos, preparando o paladar para uma experiência inesquecível. No sabor, notas vibrantes de abacaxi e frutas amarelas se mesclam com um toque elegante de conhaque, revelando uma acidez cítrica marcante e refrescante. O corpo licoroso traz uma sensação aveludada, enchendo a boca de prazer e calor. A finalização é longa e envolvente, deixando um rastro de satisfação que perdura.\n\nEste café é uma verdadeira obra de arte, fruto da dedicação e da paixão pelo terroir do Cerrado, destacando-se como um convite irresistível ao deleite.",
    "story": "Na região privilegiada do Cerrado Goiano, a Fazenda Nossa Senhora de Fátima, sob os cuidados dedicados de Cristiane Zancanaro, cultiva a joia rara que é o Catuaí Vermelho, a 1.000 metros de altitude. Este café especial, processado com o exclusivo método “sprouting” por 240 horas, apresenta uma complexidade única.\n\nAo aproximar-se, o aroma doce e frutado envolve os sentidos, preparando o paladar para uma experiência inesquecível. No sabor, notas vibrantes de abacaxi e frutas amarelas se mesclam com um toque elegante de conhaque, revelando uma acidez cítrica marcante e refrescante. O corpo licoroso traz uma sensação aveludada, enchendo a boca de prazer e calor. A finalização é longa e envolvente, deixando um rastro de satisfação que perdura.\n\nEste café é uma verdadeira obra de arte, fruto da dedicação e da paixão pelo terroir do Cerrado, destacando-se como um convite irresistível ao deleite.",
    "variety": null,
    "altitude": null,
    "process": null,
    "aroma": null,
    "flavor": null,
    "acidity": "Cítrica",
    "bodyNote": "Amanteigado",
    "finish": null,
    "producer": null,
    "origin": null,
    "roast": "Torra média",
    "scaScore": 85.0,
    "notes": [
      "Mel",
      "Frutas amarelas",
      "Caramelo"
    ],
    "family": "Doce & Licoroso",
    "images": [
      "/images/products/cafe-kalango-flor-de-mel-250g-pacote.jpg",
      "/images/products/cafe-kalango-flor-de-mel-250g-1.jpg"
    ],
    "featured": false,
    "position": 7
  },
  {
    "slug": "cafe-kalango-doce-de-leite-250g",
    "name": "Doce de Leite",
    "sku": "0014",
    "priceCents": "7000",
    "shortDescription": "Café Doce de Leite – pacote 250g",
    "description": "Variedade: 2SL\n\nAltitude: 1100 metros\n\nProcesso: Lavado\n\nAroma: Floral\n\nSabor: Doce de Leite, Frutas Tropicais e Mamão\n\nAcidez: Cítrica\n\nCorpo: Licoroso\n\nFinalização: Persistente\n\n \n\nProdutor: Odeir Schott\n\nOrigem: Manhumirim, Matas de Minas-MG",
    "story": null,
    "variety": "2SL",
    "altitude": "1100 metros",
    "process": "Lavado",
    "aroma": "Floral",
    "flavor": "Doce de Leite, Frutas Tropicais e Mamão",
    "acidity": "Cítrica",
    "bodyNote": "Licoroso",
    "finish": "Persistente",
    "producer": "Odeir Schott",
    "origin": "Manhumirim, Matas de Minas-MG",
    "roast": "Torra média",
    "scaScore": 85.5,
    "notes": [
      "Doce de leite",
      "Frutas tropicais",
      "Mamão"
    ],
    "family": "Doce & Licoroso",
    "images": [
      "/images/products/cafe-kalango-doce-de-leite-250g-pacote.jpg",
      "/images/products/cafe-kalango-doce-de-leite-250g-1.jpg"
    ],
    "featured": false,
    "position": 8
  },
  {
    "slug": "chocolate",
    "name": "Chocolate",
    "sku": "0008",
    "priceCents": "5000",
    "shortDescription": "Sabor: Amêndoas caramelizadas, chocolate e leve baunilha\n\nCorpo: Amanteigado",
    "description": "Sabor: Amêndoas caramelizadas, chocolate e leve baunilha\n\nCorpo: Amanteigado",
    "story": null,
    "variety": null,
    "altitude": null,
    "process": null,
    "aroma": null,
    "flavor": "Amêndoas caramelizadas, chocolate e leve baunilha",
    "acidity": "Cítrica",
    "bodyNote": "Amanteigado",
    "finish": null,
    "producer": null,
    "origin": null,
    "roast": "Torra média",
    "scaScore": 83.0,
    "notes": [
      "Chocolate",
      "Amêndoas caramelizadas",
      "Baunilha"
    ],
    "family": "Chocolate & Caramelo",
    "images": [
      "/images/products/chocolate-pacote.jpg",
      "/images/products/chocolate-1.jpg",
      "/images/products/chocolate-2.webp"
    ],
    "featured": false,
    "position": 9
  }
];
