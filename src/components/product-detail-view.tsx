"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/hooks/use-query";
import { SITE_NAME } from "@/lib/site-config";
import { getCardImage, getProductBySlug } from "@/services/product-service";
import { DownloadButton } from "@/components/download-button";
import { PriceBadge, ProductImage } from "@/components/product-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { ProductDetail } from "@/types";

export function ProductDetailView() {
  const slug = useSearchParams().get("slug") ?? "";
  const state = useQuery(`product:${slug}`, () => (slug ? getProductBySlug(slug) : Promise.resolve(null)));

  const title = state.status === "success" && state.data ? `${state.data.name} | ${SITE_NAME}` : null;
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto grid max-w-5xl animate-pulse gap-8 md:grid-cols-2" aria-busy="true">
        <div className="aspect-square rounded-3xl bg-slate-200" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 rounded bg-slate-200" />
          <div className="h-24 rounded bg-slate-100" />
        </div>
      </div>
    );
  }
  if (state.status === "error") return <ErrorState />;
  if (!state.data) {
    return <EmptyState title="Không tìm thấy tài nguyên" description="Tài nguyên không tồn tại hoặc đã bị ẩn." href="/" actionLabel="Về trang chủ" />;
  }
  return <ResourceContent product={state.data} />;
}

function ResourceContent({ product }: { product: ProductDetail }) {
  // the detail page shows the full-size image (the small one is only for cards)
  const image = getCardImage(product.product_images);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-6 inline-block text-sm text-slate-500 hover:text-black">
        ← Tất cả tài nguyên
      </Link>

      <div className="grid gap-8 md:grid-cols-2 md:gap-10">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <ProductImage src={image?.src} alt={product.name} priority />
        </div>

        <div>
          {product.categories && (
            <Link
              href={`/?category=${encodeURIComponent(product.categories.slug)}`}
              className="inline-block rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-black"
            >
              {product.categories.name}
            </Link>
          )}
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{product.name}</h1>
          <div className="mt-3">
            <PriceBadge price={product.price} />
          </div>
          {product.description && (
            <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">{product.description}</p>
          )}
          <div className="mt-8 max-w-sm">
            <DownloadButton productId={product.id} price={product.price} large />
          </div>
        </div>
      </div>
    </div>
  );
}
