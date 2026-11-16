/**
 * Paleta extraída do mosaico do kalango na logo. Usada como sinalização
 * (famílias sensoriais, planos do clube), sempre com o cobre reservado às ações
 * genéricas do site.
 */
export type MosaicTone = {
  /** Bolinha / pontinho de cor. */
  dot: string;
  /** Estado ativo/preenchido: fundo + borda + texto legível. */
  solid: string;
  /** Hover de um botão claro para a cor da família. */
  hoverSolid: string;
  /** Só o texto. */
  text: string;
  /** Só a borda. */
  border: string;
};

export const MOSAIC_TONES: MosaicTone[] = [
  {
    dot: "bg-mosaic-green",
    solid: "border-mosaic-green bg-mosaic-green text-ink",
    hoverSolid: "hover:bg-mosaic-green hover:text-ink",
    text: "text-mosaic-green",
    border: "border-mosaic-green",
  },
  {
    dot: "bg-mosaic-lime",
    solid: "border-mosaic-lime bg-mosaic-lime text-ink",
    hoverSolid: "hover:bg-mosaic-lime hover:text-ink",
    text: "text-mosaic-lime",
    border: "border-mosaic-lime",
  },
  {
    dot: "bg-mosaic-yellow",
    solid: "border-mosaic-yellow bg-mosaic-yellow text-ink",
    hoverSolid: "hover:bg-mosaic-yellow hover:text-ink",
    text: "text-mosaic-yellow",
    border: "border-mosaic-yellow",
  },
  {
    dot: "bg-mosaic-blue",
    solid: "border-mosaic-blue bg-mosaic-blue text-ink",
    hoverSolid: "hover:bg-mosaic-blue hover:text-ink",
    text: "text-mosaic-blue",
    border: "border-mosaic-blue",
  },
  {
    dot: "bg-mosaic-red",
    solid: "border-mosaic-red bg-mosaic-red text-cream",
    hoverSolid: "hover:bg-mosaic-red hover:text-cream",
    text: "text-mosaic-red",
    border: "border-mosaic-red",
  },
];

/**
 * Mesma família sensorial sempre recebe a mesma cor, em qualquer página —
 * derivado do nome, não da ordem em que os produtos chegam da API.
 */
export function toneFor(key: string | undefined | null): MosaicTone {
  if (!key) return MOSAIC_TONES[0];
  let hash = 0;
  for (const ch of key.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return MOSAIC_TONES[hash % MOSAIC_TONES.length];
}
