import { createClient } from "@/lib/supabase/client";
import type { BankTransfer, DonationPayment, PaymentSettings } from "@/types";

/** Public payment settings (they are printed on every transfer anyway). */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const { data, error } = await createClient()
    .from("shop_settings")
    .select("payment_mode,bank_name,bank_account,bank_account_name")
    .maybeSingle();
  if (error) throw error;
  return (data as PaymentSettings | null) ?? { payment_mode: "manual", bank_name: null, bank_account: null, bank_account_name: null };
}

/** Asks the database for a payment code. The amount always comes from the product, not from here. */
export async function createDonationPayment(productId: string): Promise<DonationPayment> {
  const { data, error } = await createClient().rpc("create_donation_payment", { p_product_id: productId });
  if (error) throw error;
  const row = (data as DonationPayment[] | null)?.[0];
  if (!row) throw new Error("no_payment");
  return row;
}

/** 'pending' | 'paid' | null (own payments only). The browser polls this; only the bank webhook can set 'paid'. */
export async function getDonationPaymentStatus(code: string): Promise<string | null> {
  const { data, error } = await createClient().rpc("get_donation_payment", { p_code: code });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Admin only (RLS). */
export async function updatePaymentSettings(values: PaymentSettings): Promise<void> {
  const { error } = await createClient().from("shop_settings").update(values).eq("id", true);
  if (error) throw error;
}

/** Admin only (RLS): the latest transfers the webhook reported. */
export async function listBankTransfers(): Promise<BankTransfer[]> {
  const { data, error } = await createClient()
    .from("bank_transfers")
    .select("id,amount,content,code,result,created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as BankTransfer[];
}
