import { createClient } from "@/lib/supabase/client";
import type { ShopSettings } from "@/types";

export async function getShopSettings(): Promise<ShopSettings> {
  const { data, error } = await createClient()
    .from("shop_settings")
    .select("shipping_fee,free_shipping_threshold")
    .maybeSingle();
  if (error) throw error;
  return (data as ShopSettings | null) ?? { shipping_fee: 0, free_shipping_threshold: null };
}

/** Admin only (RLS). */
export async function updateShopSettings(values: ShopSettings): Promise<void> {
  const { error } = await createClient().from("shop_settings").update(values).eq("id", true);
  if (error) throw error;
}
