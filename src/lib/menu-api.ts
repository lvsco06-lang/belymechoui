// Accès aux données Lovable Cloud (Supabase) pour le menu et les commandes.
import { supabase } from "@/integrations/supabase/client";
import type { CartLine, DeliveryZone, Dish, MenuEntry } from "./belyme";

/** Zones de livraison actives, triées pour l'affichage client. */
export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data as DeliveryZone[];
}

/** Menu d'un jour donné (1 = lundi … 7 = dimanche), plats actifs uniquement. */
export async function fetchMenuForDay(day: number): Promise<MenuEntry[]> {
  const { data, error } = await supabase
    .from("daily_menus")
    .select(
      "id, day_of_week, dish_id, is_special_today, stock_quantity, dish:dishes(id, name, description, category, price, image_url, is_active)",
    )
    .eq("day_of_week", day);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.dish && (row.dish as Dish).is_active)
    .map((row) => ({ ...row, dish: row.dish as Dish })) as MenuEntry[];
}

/** Nombre de commandes en cours de préparation (temps de préparation dynamique). */
export async function fetchActiveOrders(): Promise<number> {
  const { data, error } = await supabase.rpc("active_orders_count");
  if (error) throw error;
  return (data as number) ?? 0;
}

export type PlaceOrderInput = {
  customerName: string;
  phone: string;
  deliveryType: "emporter" | "livraison";
  zone: string | null;
  paymentMethod: string;
  lines: CartLine[];
  orderType?: "standard" | "evenement";
  eventDate?: string | null;
  notes?: string | null;
};

export type PlacedOrder = {
  order_id: string;
  order_number: number;
  total_amount: number;
  tracking_code: string;
};

/** Enregistre la commande + ses items et décrémente le stock du jour (fonction SQL sécurisée). */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const { data, error } = await supabase.rpc("place_order", {
    _customer_name: input.customerName,
    _customer_phone: input.phone,
    _delivery_type: input.deliveryType,
    _delivery_zone: input.zone ?? "",
    _payment_method: input.paymentMethod,
    _items: input.lines.map((l) => ({
      dish_id: l.dish_id,
      quantity: l.quantity,
      special_note: l.special_note || null,
    })),
    _order_type: input.orderType ?? "standard",
    ...(input.eventDate ? { _event_date: input.eventDate } : {}),
    ...(input.notes ? { _notes: input.notes } : {}),
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as PlacedOrder;
}
