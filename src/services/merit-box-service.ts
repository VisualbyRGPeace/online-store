import { getDonationQrUrl } from "@/services/settings-service";

export type MeritBoxQr = { imageUrl: string; title: string | null; note: string | null };

/**
 * The merit-box QR is the same image the admin uploads in the donation QR manager
 * (shop_settings.donation_qr_path, public bucket "site-assets"), so there is one place to change it.
 */
export async function getMeritBoxQr(): Promise<MeritBoxQr | null> {
  const imageUrl = await getDonationQrUrl();
  return imageUrl ? { imageUrl, title: null, note: null } : null;
}
