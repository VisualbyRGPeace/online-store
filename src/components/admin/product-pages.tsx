"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { createProduct, getAdminProduct, listAdminCategories, updateProduct, uploadProductImages } from "@/services/admin-catalog-service";
import { ProductForm } from "@/components/admin/product-form";
import { ImageManager, PendingImages } from "@/components/admin/image-tools";
import { EmptyState, ErrorState } from "@/components/ui/states";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const skeleton = <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;

export function NewProductView() {
  const router = useRouter();
  const categories = useQuery("admin-categories", listAdminCategories);
  const [files, setFiles] = useState<File[]>([]);

  if (categories.status === "loading") return skeleton;
  if (categories.status === "error") return <ErrorState />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Thêm sản phẩm</h1>
      <ProductForm
        categories={categories.data}
        submitLabel="Lưu sản phẩm"
        onSubmit={async (input) => {
          const id = await createProduct(input);
          if (files.length > 0) await uploadProductImages(id, files, 0, false);
          router.push(`/admin/products/edit/?id=${id}`);
        }}
      >
        <PendingImages files={files} onChange={setFiles} />
      </ProductForm>
    </div>
  );
}

export function EditProductView() {
  const id = useSearchParams().get("id") ?? "";
  const valid = UUID.test(id);
  const product = useQuery(`admin-product:${id}`, () => (valid ? getAdminProduct(id) : Promise.resolve(null)));
  const categories = useQuery("admin-categories", listAdminCategories);

  if (product.status === "loading" || categories.status === "loading") return skeleton;
  if (product.status === "error" || categories.status === "error") return <ErrorState />;
  if (!product.data) {
    return <EmptyState title="Không tìm thấy sản phẩm" href="/admin/products/" actionLabel="Về danh sách sản phẩm" />;
  }
  const p = product.data;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/products/" className="text-sm text-neutral-600 hover:underline">← Danh sách sản phẩm</Link>
        <h1 className="mt-1 text-2xl font-semibold">Sửa sản phẩm</h1>
      </div>
      <ProductForm categories={categories.data} initial={p} submitLabel="Lưu thay đổi" onSubmit={(input) => updateProduct(p.id, input)} />
      <div className="max-w-3xl">
        <ImageManager productId={p.id} />
      </div>
    </div>
  );
}
