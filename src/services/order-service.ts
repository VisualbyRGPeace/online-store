import { createClient } from "@/lib/supabase/client";
import { getOrder } from "@/services/account-service";
import type { PlacedOrder, PublicOrder } from "@/types";

export type CheckoutPayload = {
  items: { productId: string; quantity: number }[];
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  province: string;
  district: string;
  ward: string;
  street: string;
  note: string;
  paymentMethod: string;
};

/**
 * The browser sends only product ids + quantities + contact info. Prices, stock, shipping fee and
 * totals are computed by place_order() in the database; nothing price-related is accepted from here.
 */
export async function placeOrder(p: CheckoutPayload): Promise<PlacedOrder> {
  const { data, error } = await createClient().rpc("place_order", {
    p_items: p.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
    p_customer_name: p.customerName,
    p_customer_phone: p.customerPhone,
    p_customer_email: p.customerEmail || null,
    p_shipping_province: p.province,
    p_shipping_district: p.district,
    p_shipping_ward: p.ward,
    p_shipping_street: p.street,
    p_payment_method: p.paymentMethod,
    p_note: p.note || null,
  });
  if (error) throw error;
  const row = (data as PlacedOrder[] | null)?.[0];
  if (!row) throw new Error("place_order_empty");
  return row;
}

/** Guest lookup: needs the order id and the secret token returned when the order was placed. */
export async function getGuestOrder(id: string, token: string): Promise<PublicOrder | null> {
  const { data, error } = await createClient().rpc("get_guest_order", { p_order_id: id, p_token: token });
  if (error) throw error;
  return (data as PublicOrder | null) ?? null;
}

/** Signed-in owner: RLS only returns the order if it belongs to the current user. */
export async function getOrderForOwner(id: string): Promise<PublicOrder | null> {
  const o = await getOrder(id);
  if (!o) return null;
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    payment_status: o.payment_status,
    payment_method: o.payment_method,
    subtotal: o.subtotal,
    shipping_fee: o.shipping_fee,
    total: o.total,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    shipping_address: [o.shipping_street, o.shipping_ward, o.shipping_district, o.shipping_province].join(", "),
    created_at: o.created_at,
    items: o.order_items.map((i) => ({
      name: i.product_name_snapshot,
      price: i.price_snapshot,
      quantity: i.quantity,
      subtotal: i.subtotal,
    })),
  };
}
