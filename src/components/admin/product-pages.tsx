"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { createResource, getAdminProduct, getDriveUrl, listAdminCategories, updateResource, uploadProductImages } from "@/services/admin-catalog-service";
import { ResourceForm } from "@/components/admin/resource-form";
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
      <h1 className="text-2xl font-semibold">Thêm tài nguyên</h1>
      <ResourceForm
        categories={categories.data}
        submitLabel="Lưu tài nguyên"
        onSubmit={async (input, driveUrl) => {
          const id = await createResource(input, driveUrl);
          if (files.length > 0) await uploadProductImages(id, files, 0, false);
          router.push(`/admin/products/edit/?id=${id}`);
        }}
      >
        <PendingImages files={files} onChange={setFiles} />
      </ResourceForm>
    </div>
  );
}

export function EditProductView() {
  const id = useSearchParams().get("id") ?? "";
  const valid = UUID.test(id);
  const product = useQuery(`admin-product:${id}`, () => (valid ? getAdminProduct(id) : Promise.resolve(null)));
  const driveUrl = useQuery(`admin-drive:${id}`, () => (valid ? getDriveUrl(id) : Promise.resolve("")));
  const categories = useQuery("admin-categories", listAdminCategories);

  if (product.status === "loading" || driveUrl.status === "loading" || categories.status === "loading") return skeleton;
  if (product.status === "error" || driveUrl.status === "error" || categories.status === "error") return <ErrorState />;
  if (!product.data) {
    return <EmptyState title="Không tìm thấy tài nguyên" href="/admin/products/" actionLabel="Về danh sách" />;
  }
  const p = product.data;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/products/" className="text-sm text-neutral-600 hover:underline">← Danh sách tài nguyên</Link>
        <h1 className="mt-1 text-2xl font-semibold">Sửa tài nguyên</h1>
      </div>
      <ResourceForm
        categories={categories.data}
        initial={p}
        initialDriveUrl={driveUrl.data}
        submitLabel="Lưu thay đổi"
        onSubmit={(input, url) => updateResource(p.id, input, url)}
      />
      <div className="max-w-3xl">
        <ImageManager productId={p.id} />
      </div>
    </div>
  );
}
