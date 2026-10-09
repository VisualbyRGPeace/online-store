import type { ShopSettings } from "@/types";

/** Mirrors the rule in the database. This is only a preview: place_order() computes the real fee. */
export function computeShipping(subtotal: number, settings: ShopSettings | null): number {
  if (!settings) return 0;
  if (settings.free_shipping_threshold !== null && subtotal >= settings.free_shipping_threshold) return 0;
  return settings.shipping_fee;
}
