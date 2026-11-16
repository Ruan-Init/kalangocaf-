/**
 * Ilustrações de linha da linha lifestyle. São desenhos, não fotos: os produtos
 * ainda não existem, então a vitrine não finge ter mockup de produto real.
 * Herdam a cor do container via `currentColor`.
 */

const base = {
  className: "size-full",
  viewBox: "0 0 200 200",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function Bone() {
  return (
    <svg {...base}>
      <path d="M52 122c0-44 21-72 48-72s48 28 48 72" />
      <path d="M46 122h102c22 0 34 8 39 18H52c-4 0-6-2-6-6v-12z" />
      <path d="M100 50v72" />
      <path d="M126 57c-9 20-9 45 0 65" />
      <path d="M74 57c9 20 9 45 0 65" />
      <circle cx="100" cy="44" r="6" />
    </svg>
  );
}

function Caneca() {
  return (
    <svg {...base}>
      <path d="M56 74h68v62a18 18 0 0 1-18 18H74a18 18 0 0 1-18-18V74z" />
      <ellipse cx="90" cy="74" rx="34" ry="9" />
      <path d="M124 90h12a21 21 0 0 1 0 42h-12" />
      <path d="M76 52c7-8 1-15 5-23" />
      <path d="M100 50c7-8 1-15 5-23" />
    </svg>
  );
}

function Camiseta() {
  return (
    <svg {...base}>
      <path d="M76 48 48 63l11 31 15-7v57c0 5 3 8 8 8h36c5 0 8-3 8-8V87l15 7 11-31-28-15" />
      <path d="M76 48c0 13 11 22 24 22s24-9 24-22" />
      <path d="M88 116h24" />
    </svg>
  );
}

function Chaveiro() {
  return (
    <svg {...base}>
      <circle cx="100" cy="42" r="13" />
      <path d="M100 55v11" />
      <path d="M70 66h60c6 0 11 5 11 11v65c0 6-5 11-11 11H70c-6 0-11-5-11-11V77c0-6 5-11 11-11z" />
      <circle cx="100" cy="82" r="5" />
      <path d="M76 116c8-9 16 7 24-2s16 7 24-2" />
    </svg>
  );
}

const ART: Record<string, () => React.ReactElement> = {
  bone: Bone,
  caneca: Caneca,
  camiseta: Camiseta,
  chaveiro: Chaveiro,
};

export function MerchArt({ category, className }: { category: string; className?: string }) {
  const Art = ART[category] ?? Caneca;
  return (
    <span className={className}>
      <Art />
    </span>
  );
}
