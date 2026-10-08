"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/hooks/use-query";
import { listCategories, listProducts } from "@/services/product-service";
import { ProductGrid } from "@/components/product-card";
import { EmptyState, ErrorState, ProductGridSkeleton } from "@/components/ui/states";

const chip = "rounded-full border px-3 py-1 text-sm";

export function ProductsView() {
  const params = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const category = params.get("category") ?? undefined;

  const categories = useQuery("categories", listCategories);
  const list = useQuery(`products:${page}:${category ?? ""}`, () =>
    listProducts({ page, categorySlug: category }),
  );

  const href = (p: number) => {
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/products/?${s}` : "/products/";
  };

  return (
    <div>
      {categories.status === "success" && categories.data.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href="/products/" className={`${chip} ${!category ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>
            Tất cả
          </Link>
          {categories.data.map((c) => (
            <Link
              key={c.id}
              href={`/products/?category=${encodeURIComponent(c.slug)}`}
              className={`${chip} ${category === c.slug ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {list.status === "loading" && <ProductGridSkeleton count={12} />}
      {list.status === "error" && <ErrorState />}
      {list.status === "success" && list.data.items.length === 0 && (
        <EmptyState title="Không có sản phẩm" description="Thử chọn danh mục khác." href="/products/" actionLabel="Xem tất cả" />
      )}
      {list.status === "success" && list.data.items.length > 0 && (
        <>
          <ProductGrid products={list.data.items} />
          <Pagination page={page} totalPages={Math.ceil(list.data.total / list.data.pageSize)} href={href} />
        </>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, href }: { page: number; totalPages: number; href: (p: number) => string }) {
  if (totalPages <= 1) return null;
  const btn = "rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100";
  return (
    <nav className="mt-10 flex items-center justify-center gap-4" aria-label="Phân trang">
      {page > 1 ? <Link href={href(page - 1)} className={btn}>← Trước</Link> : <span />}
      <span className="text-sm text-neutral-600">
        Trang {page} / {totalPages}
      </span>
      {page < totalPages ? <Link href={href(page + 1)} className={btn}>Sau →</Link> : <span />}
    </nav>
  );
}
