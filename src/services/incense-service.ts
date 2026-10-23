import { createClient } from "@/lib/supabase/client";

export type IncenseMessage = {
  id: string;
  content: string;
  is_active: boolean;
  created_at: string;
};

export type BurningIncense = {
  id: string;
  donor_id: string | null;
  donor_name: string;
  message_text: string;
  npc_message_text: string;
  lit_at: string;
  expires_at: string;
  blessing_count: number;
};

export type AdminIncenseOffering = Pick<BurningIncense, "id" | "donor_name" | "message_text" | "lit_at" | "expires_at">;
export type AdminIncensePage = { items: AdminIncenseOffering[]; total: number; pageSize: number };

export async function listBurningIncense(): Promise<BurningIncense[]> {
  const { data, error } = await createClient()
    .from("incense_offerings")
    .select("id,donor_id,donor_name,message_text,npc_message_text,lit_at,expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("lit_at", { ascending: false });
  if (error) throw error;
  const offerings = (data ?? []) as Omit<BurningIncense, "blessing_count">[];
  if (!offerings.length) return [];
  const { data: blessings, error: blessingError } = await createClient()
    .from("incense_blessings")
    .select("offering_id")
    .in("offering_id", offerings.map((item) => item.id));
  if (blessingError) throw blessingError;
  const counts = new Map<string, number>();
  for (const row of (blessings ?? []) as { offering_id: string }[]) {
    counts.set(row.offering_id, (counts.get(row.offering_id) ?? 0) + 1);
  }
  return offerings.map((item) => ({ ...item, blessing_count: counts.get(item.id) ?? 0 }));
}

export async function getIncenseOfferingEnabled(): Promise<boolean> {
  const { data, error } = await createClient()
    .from("shop_settings")
    .select("accepting_incense")
    .eq("id", true)
    .single();
  if (error) throw error;
  return Boolean((data as { accepting_incense: boolean }).accepting_incense);
}

export async function setIncenseOfferingEnabled(enabled: boolean): Promise<void> {
  const { error } = await createClient()
    .from("shop_settings")
    .update({ accepting_incense: enabled })
    .eq("id", true);
  if (error) throw error;
}

export async function lightIncense(prayer: string): Promise<string> {
  const { data, error } = await createClient().rpc("light_incense", {
    p_prayer: prayer.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function listAdminIncense(page: number): Promise<AdminIncensePage> {
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const { data, error, count } = await createClient()
    .from("incense_offerings")
    .select("id,donor_name,message_text,lit_at,expires_at", { count: "exact" })
    .order("lit_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return { items: (data ?? []) as AdminIncenseOffering[], total: count ?? 0, pageSize };
}

export async function deleteAdminIncense(id: string): Promise<void> {
  const { error } = await createClient().from("incense_offerings").delete().eq("id", id);
  if (error) throw error;
}

export async function listAllIncenseMessages(): Promise<IncenseMessage[]> {
  const { data, error } = await createClient()
    .from("incense_messages")
    .select("id,content,is_active,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IncenseMessage[];
}

export async function addIncenseMessage(content: string): Promise<void> {
  const { error } = await createClient().from("incense_messages").insert({ content: content.trim() });
  if (error) throw error;
}

export async function setIncenseMessageActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await createClient().from("incense_messages").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function deleteIncenseMessage(id: string): Promise<void> {
  const { error } = await createClient().from("incense_messages").delete().eq("id", id);
  if (error) throw error;
}


export type IncensePermissions = { canDonate: boolean; canBless: boolean };

export async function getIncensePermissions(): Promise<IncensePermissions> {
  const { data, error } = await createClient().rpc("incense_permissions");
  if (error) throw error;
  const permissions = data as { can_donate?: boolean; can_bless?: boolean } | null;
  return { canDonate: Boolean(permissions?.can_donate), canBless: Boolean(permissions?.can_bless) };
}

export async function blessIncense(offeringId: string): Promise<void> {
  const { error } = await createClient().rpc("bless_incense", { p_offering_id: offeringId });
  if (error) throw error;
}
