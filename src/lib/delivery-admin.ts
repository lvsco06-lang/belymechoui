// Gestion des zones de livraison (quartiers + frais) depuis le back-office.
import { supabase } from "@/integrations/supabase/client";
import type { DeliveryZone } from "@/lib/belyme";

/** Toutes les zones (actives ou non), pour l'écran d'administration. */
export async function fetchAllDeliveryZones(): Promise<DeliveryZone[]> {
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data as DeliveryZone[];
}

export type DeliveryZoneInput = {
  name: string;
  fee: number;
  sort_order?: number;
};

export async function createDeliveryZone(input: DeliveryZoneInput): Promise<void> {
  const { error } = await supabase.from("delivery_zones").insert(input);
  if (error) throw error;
}

export async function updateDeliveryZone(
  id: string,
  input: Partial<DeliveryZoneInput> & { is_active?: boolean },
): Promise<void> {
  const { error } = await supabase.from("delivery_zones").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteDeliveryZone(id: string): Promise<void> {
  const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
  if (error) throw error;
}
