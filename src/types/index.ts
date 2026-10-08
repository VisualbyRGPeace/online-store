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
