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
};

export async function listBurningIncense(): Promise<BurningIncense[]> {
  const { data, error } = await createClient()
    .from("incense_offerings")
    .select("id,donor_id,donor_name,message_text,npc_message_text,lit_at,expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("lit_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BurningIncense[];
}

export async function lightIncense(prayer: string): Promise<string> {
  const { data, error } = await createClient().rpc("light_incense", {
    p_prayer: prayer.trim(),
  });
  if (error) throw error;
  return data as string;
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
