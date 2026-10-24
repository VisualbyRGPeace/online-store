import { createClient } from "@/lib/supabase/client";

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
  created_at: string;
};

export async function recordGifGeneration(userId: string, item: GifGenerationInput): Promise<void> {
  const { error } = await createClient()
    .from("gif_generation_history")
    .insert({ ...item, user_id: userId });
  if (error) throw error;
}

export async function listAdminGifGenerationHistory(userId: string): Promise<AdminGifHistoryRow[]> {
  const { data, error } = await createClient().rpc("admin_list_gif_generation_history", {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data ?? []) as AdminGifHistoryRow[];
}
