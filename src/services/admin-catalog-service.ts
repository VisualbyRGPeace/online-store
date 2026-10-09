import { createClient } from "@/lib/supabase/client";
import { processImage } from "@/utils/image";
import type { AdminCategory, AdminImage, AdminProduct, AdminProductRow, Page, ProductInput, ProductStatus } from "@/types";

// All writes below are allowed only for admins: enforced by RLS + Storage policies in the database.
const BUCKET = "product-images";
export const ADMIN_PAGE_SIZE = 20;

export async function listAdminProducts(page: number): Promise<Page<AdminProductRow>> {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const { data, error, count } = await createClient()
    .from("products")
    .select("id,name,slug,price,stock,status,product_images(storage_path,sort_order,is_primary)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error) throw error;
  return { items: (data ?? []) as unknown as AdminProductRow[], total: count ?? 0, pageSize: ADMIN_PAGE_SIZE };
}

export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  const { data, error } = await createClient()
    .from("products")
    .select("id,category_id,name,slug,description,price,compare_at_price,stock,status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as AdminProduct | null;
}

export async function createProduct(input: ProductInput): Promise<string> {
  const { data, error } = await createClient().from("products").insert(input).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { error } = await createClient().from("products").update(input).eq("id", id);
  if (error) throw error;
}

export async function setProductStatus(id: string, status: ProductStatus): Promise<void> {
  const { error } = await createClient().from("products").update({ status }).eq("id", id);
  if (error) throw error;
}

/** Deletes the product and its images. Past orders keep their name/price snapshots. */
export async function deleteProduct(id: string): Promise<void> {
  const supabase = createClient();
  const { data: imgs } = await supabase.from("product_images").select("storage_path").eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
  const paths = ((imgs ?? []) as { storage_path: string }[]).map((i) => i.storage_path);
  if (paths.length) {
    const removed = await supabase.storage.from(BUCKET).remove(paths);
    if (removed.error) console.error(removed.error);
  }
}

// ---- images ----
export async function listProductImages(productId: string): Promise<AdminImage[]> {
  const { data, error } = await createClient()
    .from("product_images")
    .select("id,storage_path,sort_order,is_primary")
    .eq("product_id", productId)
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as AdminImage[];
}

/** Re-encodes each file, uploads it to Storage under products/{id}/{uuid}.ext, then records it in the database. */
export async function uploadProductImages(
  productId: string,
  files: File[],
  existingCount: number,
  hasPrimary: boolean,
): Promise<{ uploaded: number; failed: string[] }> {
  const supabase = createClient();
  const storage = supabase.storage.from(BUCKET);
  let uploaded = 0;
  let primaryTaken = hasPrimary;
  const failed: string[] = [];

  for (const file of files) {
    try {
      const { blob, ext } = await processImage(file);
      const path = `products/${productId}/${crypto.randomUUID()}.${ext}`;
      const up = await storage.upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
      if (up.error) throw up.error;
      const ins = await supabase.from("product_images").insert({
        product_id: productId,
        storage_path: path,
        sort_order: existingCount + uploaded,
        is_primary: !primaryTaken,
      });
      if (ins.error) {
        await storage.remove([path]);
        throw ins.error;
      }
      primaryTaken = true;
      uploaded += 1;
    } catch (err) {
      console.error(err);
      failed.push(file.name.slice(0, 60));
    }
  }
  return { uploaded, failed };
}

export async function setPrimaryImage(productId: string, imageId: string): Promise<void> {
  const supabase = createClient();
  const first = await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId).eq("is_primary", true);
  if (first.error) throw first.error;
  const second = await supabase.from("product_images").update({ is_primary: true }).eq("id", imageId);
  if (second.error) throw second.error;
}

export async function reorderImages(orderedIds: string[]): Promise<void> {
  const supabase = createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from("product_images").update({ sort_order: index }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function deleteProductImage(productId: string, image: AdminImage): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("product_images").delete().eq("id", image.id);
  if (error) throw error;
  const removed = await supabase.storage.from(BUCKET).remove([image.storage_path]);
  if (removed.error) console.error(removed.error);
  if (image.is_primary) {
    const { data } = await supabase.from("product_images").select("id").eq("product_id", productId).order("sort_order").limit(1);
    const next = (data as { id: string }[] | null)?.[0];
    if (next) await setPrimaryImage(productId, next.id);
  }
}

// ---- categories ----
export async function listAdminCategories(): Promise<AdminCategory[]> {
  const { data, error } = await createClient()
    .from("categories")
    .select("id,name,slug,is_active,sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as AdminCategory[];
}

export async function createCategory(values: { name: string; slug: string }): Promise<void> {
  const { error } = await createClient().from("categories").insert(values);
  if (error) throw error;
}

export async function updateCategory(id: string, patch: { name?: string; is_active?: boolean }): Promise<void> {
  const { error } = await createClient().from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await createClient().from("categories").delete().eq("id", id);
  if (error) throw error;
}
