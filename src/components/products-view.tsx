"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/hooks/use-query";
import { listCategories, listProducts } from "@/services/product-service";
import { ProductGrid } from "@/components/product-card";
import { EmptyState, ErrorState, ProductGridSkeleton } from "@/components/ui/states";

type Kind = "free" | "paid";
const chip = "rounded-full border px-3 py-1 text-sm";
const on = "border-neutral-900 bg-neutral-900 text-white";
const off = "border-neutral-300";

function buildHref(opts: { category?: string; type?: Kind; page?: number }) {
  const q = new URLSearchParams();
  if (opts.type) q.set("type", opts.type);
  if (opts.category) q.set("category", opts.category);
  if (opts.page && opts.page > 1) q.set("page", String(opts.page));
  const s = q.toString();
  return s ? `/products/?${s}` : "/products/";
}

export function ProductsView() {
  const params = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const category = params.get("category") ?? undefined;
  const typeParam = params.get("type");
  const type: Kind | undefined = typeParam === "free" || typeParam === "paid" ? typeParam : undefined;

  const categories = useQuery("categories", listCategories);
  const list = useQuery(`products:${page}:${category ?? ""}:${type ?? ""}`, () =>
    listProducts({ page, categorySlug: category, kind: type }),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={buildHref({ category })} className={`${chip} ${!type ? on : off}`}>Tất cả</Link>
        <Link href={buildHref({ category, type: "free" })} className={`${chip} ${type === "free" ? on : off}`}>Miễn phí</Link>
        <Link href={buildHref({ category, type: "paid" })} className={`${chip} ${type === "paid" ? on : off}`}>Trả phí</Link>
      </div>
      {categories.status === "success" && categories.data.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href={buildHref({ type })} className={`${chip} ${!category ? on : off}`}>Mọi danh mục</Link>
          {categories.data.map((c) => (
            <Link key={c.id} href={buildHref({ type, category: c.slug })} className={`${chip} ${category === c.slug ? on : off}`}>
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {list.status === "loading" && <ProductGridSkeleton count={12} />}
      {list.status === "error" && <ErrorState />}
      {list.status === "success" && list.data.items.length === 0 && (
        <EmptyState title="Chưa có tài nguyên" description="Thử chọn bộ lọc khác." href="/products/" actionLabel="Xem tất cả" />
      )}
      {list.status === "success" && list.data.items.length > 0 && (
        <>
          <ProductGrid products={list.data.items} />
          <Pagination page={page} totalPages={Math.ceil(list.data.total / list.data.pageSize)} href={(p) => buildHref({ category, type, page: p })} />
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
      <span className="text-sm text-neutral-600">Trang {page} / {totalPages}</span>
      {page < totalPages ? <Link href={href(page + 1)} className={btn}>Sau →</Link> : <span />}
    </nav>
  );
}
