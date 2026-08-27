// Panier interactif (ajout, quantité, note spéciale) partagé par toute la page.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CartLine } from "./belyme";

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "quantity" | "special_note">, quantity?: number) => void;
  setQuantity: (dishId: string, quantity: number) => void;
  setNote: (dishId: string, note: string) => void;
  remove: (dishId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback<CartContextValue["add"]>((line, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.dish_id === line.dish_id);
      if (existing) {
        return prev.map((l) =>
          l.dish_id === line.dish_id ? { ...l, quantity: l.quantity + quantity } : l,
        );
      }
      return [...prev, { ...line, quantity, special_note: "" }];
    });
  }, []);

  const setQuantity = useCallback<CartContextValue["setQuantity"]>((dishId, quantity) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.dish_id !== dishId)
        : prev.map((l) => (l.dish_id === dishId ? { ...l, quantity } : l)),
    );
  }, []);

  const setNote = useCallback<CartContextValue["setNote"]>((dishId, note) => {
    setLines((prev) => prev.map((l) => (l.dish_id === dishId ? { ...l, special_note: note } : l)));
  }, []);

  const remove = useCallback((dishId: string) => {
    setLines((prev) => prev.filter((l) => l.dish_id !== dishId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal: lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0),
      add,
      setQuantity,
      setNote,
      remove,
      clear,
    }),
    [lines, add, setQuantity, setNote, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans un CartProvider");
  return ctx;
}
