/**
 * Moagens aceitas no pedido. A página de produto (web/pages/produto.tsx) mostra
 * a mesma lista — se mudar aqui, mude lá também.
 */
export const GRINDS = ["Grãos", "Espresso", "Coado", "Prensa francesa", "Italiana"] as const;
export type Grind = (typeof GRINDS)[number];
