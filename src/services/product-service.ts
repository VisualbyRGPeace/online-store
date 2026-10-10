import { createClient } from "@/lib/supabase/client";
import type { Category, Page, ProductDetail, ProductImageRow, ProductListItem } from "@/types";

export const PAGE_SIZE = 12;

const IMAGES = "product_images(storage_path,sort_order,is_primary)";
const LIST_COLUMNS = `id,name,slug,description,price,compare_at_price,stock,${IMAGES}`;

/** Public image URLs, primary image first. */
export function getImageUrls(images: ProductImageRow[]): string[] {
  const storage = createClient().storage.from("product-images");
  return [...images]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .map((img) => storage.getPublicUrl(img.storage_path).data.publicUrl);
}

export async function listProducts(opts: {
  page: number;
  categorySlug?: string;
  kind?: "free" | "paid";
  pageSize?: number;
}): Promise<Page<ProductListItem>> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const from = (opts.page - 1) * pageSize;
  const supabase = createClient();

  let query = supabase
    .from("products")
    .select(opts.categorySlug ? `${LIST_COLUMNS},categories!inner(slug)` : LIST_COLUMNS, {
      count: "exact",
    })
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (opts.categorySlug) query = query.eq("categories.slug", opts.categorySlug);
  if (opts.kind === "free") query = query.eq("price", 0);
  if (opts.kind === "paid") query = query.gt("price", 0);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: (data ?? []) as unknown as ProductListItem[], total: count ?? 0, pageSize };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const { data, error } = await createClient()
    .from("products")
    .select(`id,name,slug,description,price,compare_at_price,stock,${IMAGES},categories(name,slug)`)
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ProductDetail | null;
}

/** Fresh price/stock for cart lines. Inactive products are filtered out by RLS. */
export async function getProductsByIds(ids: string[]): Promise<ProductListItem[]> {
  const { data, error } = await createClient()
    .from("products")
    .select(LIST_COLUMNS)
    .in("id", ids)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as unknown as ProductListItem[];
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await createClient()
    .from("categories")
    .select("id,name,slug")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Category[];
}

export function publicImageUrl(path: string): string {
  return createClient().storage.from("product-images").getPublicUrl(path).data.publicUrl;
}

/**
 * Asks the database for the Google Drive link. It answers only if this person may download:
 * free + visible resource -> anyone; paid resource -> a buyer with a paid order; admin -> always.
 */
export async function getDownloadUrl(productId: string): Promise<string | null> {
  const { data, error } = await createClient().rpc("get_download_url", { p_product_id: productId });
  if (error) throw error;
  return (data as string | null) ?? null;
}
