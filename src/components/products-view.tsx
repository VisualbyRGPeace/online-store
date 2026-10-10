"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/hooks/use-query";
import { listCategories, listProducts } from "@/services/product-service";
import { ProductGrid } from "@/components/product-card";
import { SearchBox } from "@/components/search-box";
import { EmptyState, ErrorState, ProductGridSkeleton } from "@/components/ui/states";

type Kind = "free" | "paid";
const chip = "rounded-full border px-3.5 py-1.5 text-sm font-medium transition";
const on = "border-brand-600 bg-brand-600 text-white shadow-sm";
const off = "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50";

function buildHref(opts: { category?: string; type?: Kind; q?: string; page?: number }) {
  const q = new URLSearchParams();
  if (opts.q) q.set("q", opts.q);
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
  const q = params.get("q")?.slice(0, 100) || undefined;
  const typeParam = params.get("type");
  const type: Kind | undefined = typeParam === "free" || typeParam === "paid" ? typeParam : undefined;

  const categories = useQuery("categories", listCategories);
  const list = useQuery(`products:${page}:${category ?? ""}:${type ?? ""}:${q ?? ""}`, () =>
    listProducts({ page, categorySlug: category, kind: type, q }),
  );

  return (
    <div>
      <SearchBox key={q ?? ""} defaultValue={q ?? ""} className="mb-6 max-w-xl" />

      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={buildHref({ category, q })} className={`${chip} ${!type ? on : off}`}>Tất cả</Link>
        <Link href={buildHref({ category, q, type: "free" })} className={`${chip} ${type === "free" ? on : off}`}>Miễn phí</Link>
        <Link href={buildHref({ category, q, type: "paid" })} className={`${chip} ${type === "paid" ? on : off}`}>Trả phí</Link>
      </div>
      {categories.status === "success" && categories.data.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href={buildHref({ type, q })} className={`${chip} ${!category ? on : off}`}>Mọi danh mục</Link>
          {categories.data.map((c) => (
            <Link key={c.id} href={buildHref({ type, q, category: c.slug })} className={`${chip} ${category === c.slug ? on : off}`}>
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {list.status === "success" && list.data.items.length > 0 && (
        <p className="mb-4 text-sm text-slate-500">
          {list.data.total} tài nguyên{q ? ` cho “${q}”` : ""}
        </p>
      )}
      {list.status === "loading" && <ProductGridSkeleton count={12} />}
      {list.status === "error" && <ErrorState />}
      {list.status === "success" && list.data.items.length === 0 && (
        <EmptyState title="Không tìm thấy tài nguyên" description="Thử từ khóa hoặc bộ lọc khác." href="/products/" actionLabel="Xem tất cả" />
      )}
      {list.status === "success" && list.data.items.length > 0 && (
        <>
          <ProductGrid products={list.data.items} />
          <Pagination page={page} totalPages={Math.ceil(list.data.total / list.data.pageSize)} href={(p) => buildHref({ category, type, q, page: p })} />
        </>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, href }: { page: number; totalPages: number; href: (p: number) => string }) {
  if (totalPages <= 1) return null;
  const btn = "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50";
  return (
    <nav className="mt-12 flex items-center justify-center gap-4" aria-label="Phân trang">
      {page > 1 ? <Link href={href(page - 1)} className={btn}>← Trước</Link> : <span />}
      <span className="text-sm text-slate-500">Trang {page} / {totalPages}</span>
      {page < totalPages ? <Link href={href(page + 1)} className={btn}>Sau →</Link> : <span />}
    </nav>
  );
}
