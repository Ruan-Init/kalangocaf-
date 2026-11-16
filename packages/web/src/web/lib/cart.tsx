import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = {
  slug: string;
  name: string;
  image: string | null;
  unitCents: number;
  grind: string;
  quantity: number;
};

type CartState = {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  add: (line: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  setQuantity: (slug: string, grind: string, quantity: number) => void;
  remove: (slug: string, grind: string) => void;
  clear: () => void;
  /**
   * Tira do carrinho só o que foi comprado num pedido pago (uma vez por pedido),
   * preservando o que o cliente adicionou depois — inclusive em outra aba.
   */
  settlePurchase: (reference: string, items: { slug: string | null; grind: string; quantity: number }[]) => void;
};

const STORAGE_KEY = "kalango.cart.v1";
const SETTLED_KEY = "kalango.cart.settled.v1";

function readSettled(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(SETTLED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
const CartContext = createContext<CartState | null>(null);

function read(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(read);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const raw = JSON.stringify(lines);
    if (window.localStorage.getItem(STORAGE_KEY) !== raw) window.localStorage.setItem(STORAGE_KEY, raw);
  }, [lines]);

  // Mantém as abas em sincronia: o carrinho de outra aba não sobrescreve este com dado velho.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLines(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const add = useCallback((line: Omit<CartLine, "quantity"> & { quantity?: number }) => {
    const qty = line.quantity ?? 1;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.slug === line.slug && l.grind === line.grind);
      if (i === -1) return [...prev, { ...line, quantity: qty }];
      const next = [...prev];
      next[i] = { ...next[i], quantity: Math.min(20, next[i].quantity + qty) };
      return next;
    });
    setIsOpen(true);
  }, []);

  const setQuantity = useCallback((slug: string, grind: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => !(l.slug === slug && l.grind === grind))
        : prev.map((l) =>
          l.slug === slug && l.grind === grind ? { ...l, quantity: Math.min(20, quantity) } : l
        )
    );
  }, []);

  const remove = useCallback((slug: string, grind: string) => {
    setLines((prev) => prev.filter((l) => !(l.slug === slug && l.grind === grind)));
  }, []);

  const settlePurchase = useCallback<CartState["settlePurchase"]>((reference, items) => {
    const settled = readSettled();
    if (settled.includes(reference)) return;
    window.localStorage.setItem(SETTLED_KEY, JSON.stringify([...settled, reference].slice(-50)));
    // Lê o estado gravado (pode ter mudado em outra aba) antes de subtrair.
    const current = read();
    const next = current
      .map((l) => {
        const bought = items
          .filter((i) => i.slug === l.slug && i.grind === l.grind)
          .reduce((s, i) => s + i.quantity, 0);
        return { ...l, quantity: l.quantity - bought };
      })
      .filter((l) => l.quantity > 0);
    setLines(next);
  }, []);

  const value = useMemo<CartState>(() => ({
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotalCents: lines.reduce((s, l) => s + l.unitCents * l.quantity, 0),
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    add,
    setQuantity,
    remove,
    clear: () => setLines([]),
    settlePurchase,
  }), [lines, isOpen, add, setQuantity, remove, settlePurchase]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart precisa estar dentro de <CartProvider>");
  return ctx;
}
