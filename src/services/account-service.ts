import { createClient } from "@/lib/supabase/client";
import type { Address, OrderDetail, OrderSummary, Profile } from "@/types";

// Every query below relies on RLS: a signed-in user can only read/write their own rows.

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await createClient()
    .from("profiles")
    .select("full_name,phone")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? { full_name: null, phone: null };
}

export async function updateProfile(userId: string, values: { full_name: string; phone: string }) {
  const { error } = await createClient()
    .from("profiles")
    .update({ full_name: values.full_name || null, phone: values.phone || null })
    .eq("id", userId);
  if (error) throw error;
}

const ADDRESS_COLUMNS = "id,recipient_name,phone,province,district,ward,street,is_default";

export async function listAddresses(): Promise<Address[]> {
  const { data, error } = await createClient()
    .from("addresses")
    .select(ADDRESS_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Address[];
}

export async function addAddress(
  userId: string,
  values: Omit<Address, "id" | "is_default">,
  makeDefault: boolean,
) {
  const supabase = createClient();
  if (makeDefault) {
    const { error } = await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
    if (error) throw error;
  }
  const { error } = await supabase.from("addresses").insert({ ...values, user_id: userId, is_default: makeDefault });
  if (error) throw error;
}

export async function setDefaultAddress(userId: string, addressId: string) {
  const supabase = createClient();
  const { error: e1 } = await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("addresses").update({ is_default: true }).eq("id", addressId).eq("user_id", userId);
  if (e2) throw e2;
}

export async function deleteAddress(addressId: string) {
  const { error } = await createClient().from("addresses").delete().eq("id", addressId);
  if (error) throw error;
}

export async function listOrders(): Promise<OrderSummary[]> {
  const { data, error } = await createClient()
    .from("orders")
    .select("id,order_number,status,payment_status,total,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as OrderSummary[];
}

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const { data, error } = await createClient()
    .from("orders")
    .select(
      "id,order_number,status,payment_status,payment_method,subtotal,shipping_fee,total,customer_name,customer_phone,shipping_province,shipping_district,shipping_ward,shipping_street,note,created_at,order_items(id,product_name_snapshot,price_snapshot,quantity,subtotal)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as OrderDetail | null;
}
