import { createClient } from "@/lib/supabase/client";
import type { AdminOrderRow, Customer, DashboardStats, Page } from "@/types";
import { ADMIN_PAGE_SIZE } from "@/services/admin-catalog-service";

export async function getMyRole(userId: string): Promise<string | null> {
  const { data, error } = await createClient().from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw error;
  return (data as { role: string } | null)?.role ?? null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await createClient().rpc("admin_dashboard_stats");
  if (error) throw error;
  return data as DashboardStats;
}

export async function listAdminOrders(page: number, status?: string): Promise<Page<AdminOrderRow>> {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  let query = createClient()
    .from("orders")
    .select("id,order_number,status,payment_status,payment_method,total,created_at,customer_name", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) throw error;
  return { items: (data ?? []) as AdminOrderRow[], total: count ?? 0, pageSize: ADMIN_PAGE_SIZE };
}

// Status changes go through database functions that validate allowed transitions and restock on cancel.
export async function setOrderStatus(orderId: string, status: string): Promise<void> {
  const { error } = await createClient().rpc("admin_set_order_status", { p_order_id: orderId, p_status: status });
  if (error) throw error;
}

export async function markCodPaid(orderId: string): Promise<void> {
  const { error } = await createClient().rpc("admin_mark_cod_paid", { p_order_id: orderId });
  if (error) throw error;
}

export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await createClient().rpc("admin_list_customers");
  if (error) throw error;
  return (data ?? []) as Customer[];
}
