import { createClient } from "@/lib/supabase/client";

export type AdminQrHistoryRow = {
  id: string;
  content: string;
  created_at: string;
  member_name: string;
  total_count: number;
};

export type AdminQrHistoryPage = {
  items: AdminQrHistoryRow[];
  total: number;
  pageSize: number;
};

const PAGE_SIZE = 50;

export async function recordQrGeneration(userId: string, content: string): Promise<void> {
  const { error } = await createClient()
    .from("qr_generation_history")
    .insert({ user_id: userId, content });
  if (error) throw error;
}

export async function listAdminQrHistory(page: number): Promise<AdminQrHistoryPage> {
  const { data, error } = await createClient().rpc("admin_list_qr_history", {
    p_page: page,
    p_page_size: PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as AdminQrHistoryRow[];
  return {
    items: rows,
    total: Number(rows[0]?.total_count ?? 0),
    pageSize: PAGE_SIZE,
  };
}

export async function deleteAdminQrHistory(id: string): Promise<void> {
  const { error } = await createClient().rpc("admin_delete_qr_history", { p_id: id });
  if (error) throw error;
}
