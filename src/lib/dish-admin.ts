// Gestion des plats et de leurs photos depuis le back-office.
import { supabase } from "@/integrations/supabase/client";
import type { Dish } from "@/lib/belyme";

export const DISH_BUCKET = "dish-images";
// Le bucket est privé : on génère une URL signée longue durée stockée dans dishes.image_url.
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10; // ~10 ans

export type DishInput = {
  name: string;
  description: string;
  category: string;
  price: number;
  is_active: boolean;
};

/** Envoie la photo dans le stockage et renvoie une URL affichable dans un <img>. */
export async function uploadDishImage(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(DISH_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.storage
    .from(DISH_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) throw error ?? new Error("URL de l'image indisponible");

  return data.signedUrl;
}

export async function createDish(input: DishInput, file?: File | null): Promise<Dish> {
  const image_url = file ? await uploadDishImage(file) : null;
  const { data, error } = await supabase
    .from("dishes")
    .insert({ ...input, image_url })
    .select()
    .single();
  if (error) throw error;
  return data as Dish;
}

export async function updateDish(
  id: string,
  input: Partial<DishInput>,
  file?: File | null,
): Promise<void> {
  const patch: Partial<DishInput> & { image_url?: string } = { ...input };
  if (file) patch.image_url = await uploadDishImage(file);
  const { error } = await supabase.from("dishes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDish(id: string): Promise<void> {
  const { error } = await supabase.from("dishes").delete().eq("id", id);
  if (error) throw error;
}
