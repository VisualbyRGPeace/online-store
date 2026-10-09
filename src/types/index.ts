export type ProductImageRow = {
  storage_path: string;
  sort_order: number;
  is_primary: boolean;
};

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
  product_images: ProductImageRow[];
};

export type ProductDetail = ProductListItem & {
  description: string | null;
  categories: { name: string; slug: string } | null;
};

export type Category = { id: string; name: string; slug: string };

export type Page<T> = { items: T[]; total: number; pageSize: number };

export type Profile = { full_name: string | null; phone: string | null };

export type Address = {
  id: string;
  recipient_name: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street: string;
  is_default: boolean;
};

export type OrderSummary = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
};

export type OrderItemRow = {
  id: string;
  product_name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  subtotal: number;
};

export type OrderDetail = OrderSummary & {
  payment_method: string;
  subtotal: number;
  shipping_fee: number;
  customer_name: string;
  customer_phone: string;
  shipping_province: string;
  shipping_district: string;
  shipping_ward: string;
  shipping_street: string;
  note: string | null;
  order_items: OrderItemRow[];
};
