import { createClient } from "@/lib/supabase/client";
import type { DownloadLog } from "@/types";

/**
 * Download history of one user, newest first. RLS decides who may read it: a user sees only their
 * own rows, an admin sees everyone's. (The explicit user filter keeps an admin's own page to their own rows.)
 */
export async function listDownloads(userId: string, limit: number): Promise<DownloadLog[]> {
  const { data, error } = await createClient()
    .from("download_logs")
    .select("id,product_id,product_name,created_at,products(slug)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as DownloadLog[];
}
