import { createClient } from "@/lib/supabase/client";
import { listCustomers } from "@/services/admin-order-service";

export type GifGenerationInput = {
  source_filename: string;
  gif_filename: string;
  duration_seconds: number;
  output_size_bytes: number;
  output_quality: string;
  caption: string;
};

export type AdminGifHistoryRow = GifGenerationInput & {
  id: string;
  storage_path: string;
  created_at: string;
  preview_url: string | null;
};

const HISTORY_LIMIT = 10;

export async function recordGifGeneration(userId: string, item: GifGenerationInput, blob: Blob): Promise<void> {
  const supabase = createClient();
  const storagePath = `${userId}/${crypto.randomUUID()}.gif`;
  const bucket = supabase.storage.from("gif-history");

  const { error: uploadError } = await bucket.upload(storagePath, blob, {
    contentType: "image/gif",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from("gif_generation_history")
    .insert({ ...item, storage_path: storagePath, user_id: userId });
  if (insertError) {
    await bucket.remove([storagePath]);
    throw insertError;
  }

  // Keep only each member's ten newest records and their GIF files.
  const { data: rows, error: listError } = await supabase
    .from("gif_generation_history")
    .select("id,storage_path")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (listError) throw listError;

  const expired = (rows ?? []).slice(HISTORY_LIMIT);
  if (!expired.length) return;

  const { error: removeError } = await bucket.remove(expired.map((row) => row.storage_path));
  if (removeError) throw removeError;

  const { error: deleteError } = await supabase
    .from("gif_generation_history")
    .delete()
    .in("id", expired.map((row) => row.id));
  if (deleteError) throw deleteError;
}

export async function listAdminGifGenerationHistory(userId: string): Promise<AdminGifHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_list_gif_generation_history", {
    p_user_id: userId,
  });
  if (error) throw error;

  const rows = ((data ?? []) as Omit<AdminGifHistoryRow, "preview_url">[]).slice(0, HISTORY_LIMIT);
  return Promise.all(rows.map(async (row) => {
    const { data: signed, error: signedError } = await supabase.storage
      .from("gif-history")
      .createSignedUrl(row.storage_path, 60 * 60);
    return { ...row, preview_url: signedError ? null : signed?.signedUrl ?? null };
  }));
}


export type AdminGifHistoryFeedItem = AdminGifHistoryRow & {
  member_name: string;
  member_email: string;
};

export async function listAllAdminGifGenerationHistory(): Promise<AdminGifHistoryFeedItem[]> {
  const customers = await listCustomers();
  const perCustomer = await Promise.all(customers.map(async (customer) => {
    const rows = await listAdminGifGenerationHistory(customer.id);
    return rows.map((row) => ({
      ...row,
      member_name: customer.full_name || customer.email,
      member_email: customer.email,
    }));
  }));

  return perCustomer.flat().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
