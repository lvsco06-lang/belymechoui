// Statistiques de revenu et historique des mouvements de stock (back-office).
import { supabase } from "@/integrations/supabase/client";

export const STOCK_MOVEMENT_REASONS: Record<string, string> = {
  vente: "Vente",
  ajustement: "Ajustement manuel",
};

export type StockMovement = {
  id: string;
  created_at: string;
  change: number;
  reason: string;
  note: string | null;
  dish_name: string;
};

/** Derniers mouvements de stock (toutes ventes et ajustements confondus), plat le plus récent en tête. */
export async function fetchStockMovements(limit = 30): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, created_at, change, reason, note, dish:dishes(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    change: row.change,
    reason: row.reason,
    note: row.note,
    dish_name: (row.dish as { name: string } | null)?.name ?? "Plat supprimé",
  }));
}

/** Mouvements de stock survenus entre deux bornes ISO (pour le rapport quotidien). */
export async function fetchStockMovementsBetween(
  startIso: string,
  endIso: string,
): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, created_at, change, reason, note, dish:dishes(name)")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    change: row.change,
    reason: row.reason,
    note: row.note,
    dish_name: (row.dish as { name: string } | null)?.name ?? "Plat supprimé",
  }));
}
