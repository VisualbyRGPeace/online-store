"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/hooks/use-query";
import { getImageUrls, getProductBySlug } from "@/services/product-service";
import { DownloadButton } from "@/components/download-button";
import { PriceBadge, ProductImage } from "@/components/product-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SITE_NAME } from "@/lib/site-config";
import type { ProductDetail } from "@/types";

export function ProductDetailView() {
  const slug = useSearchParams().get("slug") ?? "";
  const state = useQuery(`product:${slug}`, () => (slug ? getProductBySlug(slug) : Promise.resolve(null)));

  const title = state.status === "success" && state.data ? `${state.data.name} | ${SITE_NAME}` : null;
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  if (state.status === "loading") {
    return <div className="aspect-square max-w-md animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  }
  if (state.status === "error") return <ErrorState />;
  if (!state.data) {
    return <EmptyState title="Không tìm thấy tài nguyên" description="Tài nguyên không tồn tại hoặc đã bị ẩn." href="/products/" actionLabel="Xem tài nguyên khác" />;
  }
  return <ResourceContent product={state.data} />;
}

function ResourceContent({ product }: { product: ProductDetail }) {
  const image = getImageUrls(product.product_images)[0];
  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
      <ProductImage src={image} alt={product.name} className="rounded-lg" />
      <div>
        {product.categories && (
          <Link href={`/products/?category=${encodeURIComponent(product.categories.slug)}`} className="text-sm text-neutral-500 hover:underline">
            {product.categories.name}
          </Link>
        )}
        <h1 className="mt-1 text-2xl font-semibold">{product.name}</h1>
        <div className="mt-3">
          <PriceBadge price={product.price} />
        </div>
        {product.description && (
          <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-neutral-700">{product.description}</p>
        )}
        <div className="mt-6 max-w-xs">
          <DownloadButton productId={product.id} price={product.price} large />
        </div>
      </div>
    </div>
  );
}
