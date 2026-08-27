// Suivi de commande sans compte : lecture publique via un code.
import { supabase } from "@/integrations/supabase/client";

export type TrackedItem = {
  dish_name: string;
  quantity: number;
  unit_price: number;
};

export type TrackedOrder = {
  order_number: number;
  status: string;
  status_updated_at: string;
  created_at: string;
  order_type: string;
  delivery_type: string;
  delivery_zone: string | null;
  total_amount: number;
  customer_first_name: string;
  items: TrackedItem[];
};

const STORAGE_KEY = "belyme:derniers-codes";
const CODE_LENGTH = 10;

/** Retire tirets, espaces et casse : "n a3q-p65b95" -> "NA3QP65B95". */
export function normalizeCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Affichage lisible : "NA3QP65B95" -> "NA3QP-65B95". */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === CODE_LENGTH ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

export function isValidCode(input: string): boolean {
  return normalizeCode(input).length === CODE_LENGTH;
}

/**
 * Récupère le suivi d'une commande.
 * Renvoie null si le code ne correspond à rien — on ne distingue pas
 * "code inexistant" de "code mal formé", pour ne rien révéler.
 */
export async function trackOrder(code: string): Promise<TrackedOrder | null> {
  const clean = normalizeCode(code);
  if (clean.length !== CODE_LENGTH) return null;

  const { data, error } = await supabase.rpc("track_order", { _code: clean });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
  } as TrackedOrder;
}

// --- Mémorisation locale des commandes du visiteur --------------------------
// Confort uniquement : évite de retaper le code. Aucune donnée sensible.

export function rememberCode(code: string, orderNumber: number): void {
  if (typeof window === "undefined") return;
  try {
    const list = readCodes().filter((c) => c.code !== normalizeCode(code));
    list.unshift({ code: normalizeCode(code), orderNumber, at: Date.now() });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 5)));
  } catch {
    // Navigation privée ou stockage plein : on ignore, ce n'est qu'un confort.
  }
}

export function readCodes(): { code: string; orderNumber: number; at: number }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// --- Progression visuelle ---------------------------------------------------

export const TRACK_STEPS = ["En préparation", "En livraison", "Livré"] as const;

/** Index de l'étape courante ; -1 pour une commande annulée. */
export function stepIndex(status: string): number {
  if (status === "Annulé") return -1;
  const i = TRACK_STEPS.indexOf(status as (typeof TRACK_STEPS)[number]);
  return i === -1 ? 0 : i;
}

/** "il y a 3 min", "il y a 2 h", "il y a 4 j". */
export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}
