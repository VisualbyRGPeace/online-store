import { createClient } from "@/lib/supabase/client";
import { processQrImage } from "@/utils/image";
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

// ---- donation QR image (public bucket "site-assets", folder qr/) ----
const SITE_BUCKET = "site-assets";

async function getDonationQrPath(): Promise<string | null> {
  const { data, error } = await createClient().from("shop_settings").select("donation_qr_path").maybeSingle();
  if (error) throw error;
  return (data as { donation_qr_path: string | null } | null)?.donation_qr_path ?? null;
}

/** Public URL of the QR image set by the admin, or null when none has been uploaded. */
export async function getDonationQrUrl(): Promise<string | null> {
  const path = await getDonationQrPath();
  return path ? createClient().storage.from(SITE_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/** Admin only: uploads a new QR image, saves its path, then deletes the previous image. */
export async function uploadDonationQr(file: File): Promise<void> {
  const supabase = createClient();
  const storage = supabase.storage.from(SITE_BUCKET);
  const blob = await processQrImage(file);
  const path = `qr/${crypto.randomUUID()}.png`;
  const up = await storage.upload(path, blob, { contentType: "image/png", upsert: false, cacheControl: "31536000" });
  if (up.error) throw up.error;
  const previous = await getDonationQrPath();
  const { error } = await supabase.from("shop_settings").update({ donation_qr_path: path }).eq("id", true);
  if (error) {
    await storage.remove([path]);
    throw error;
  }
  if (previous) await storage.remove([previous]);
}

/** Admin only. */
export async function removeDonationQr(): Promise<void> {
  const supabase = createClient();
  const previous = await getDonationQrPath();
  const { error } = await supabase.from("shop_settings").update({ donation_qr_path: null }).eq("id", true);
  if (error) throw error;
  if (previous) await supabase.storage.from(SITE_BUCKET).remove([previous]);
}
