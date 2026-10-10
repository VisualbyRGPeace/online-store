"use client";

import Link from "next/link";
import { useState } from "react";
import { DownloadButton } from "@/components/download-button";
import { ImageIcon } from "@/components/ui/icons";
import { FREE_LABEL } from "@/lib/site-config";
import { getCardImage } from "@/services/product-service";
import { formatVnd } from "@/utils/format";
import type { ProductListItem } from "@/types";

/** Square image. Uses `src`; if it fails to load (for example no small version yet) it switches to `fallback`. */
export function ProductImage({
  src,
  fallback,
  alt,
  className = "",
  priority = false,
}: {
  src?: string;
  fallback?: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const current = failed && fallback ? fallback : src;

  if (!current) {
    return (
      <div className={`flex aspect-square w-full flex-col items-center justify-center gap-1 bg-linear-to-br from-slate-100 to-slate-200 text-slate-400 ${className}`}>
        <ImageIcon />
        <span className="text-xs">Chưa có ảnh</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      width={400}
      height={400}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => {
        if (fallback && !failed) setFailed(true);
      }}
      className={`aspect-square w-full bg-slate-100 object-cover ${className}`}
    />
  );
}

export function PriceBadge({ price }: { price: number }) {
  return price === 0 ? (
    <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black shadow-sm ring-1 ring-black/10">{FREE_LABEL}</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white shadow-sm">{formatVnd(price)}</span>
  );
}

export function ProductCard({ product }: { product: ProductListItem }) {
  const image = getCardImage(product.product_images);
  const href = `/product/?slug=${encodeURIComponent(product.slug)}`;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <Link href={href} className="block" aria-label={product.name}>
        <div className="relative overflow-hidden">
          <ProductImage src={image?.small} fallback={image?.src} alt={product.name} className="transition duration-300 group-hover:scale-105" />
          <span className="absolute left-3 top-3">
            <PriceBadge price={product.price} />
          </span>
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-[15px] font-semibold">
          <Link href={href} className="hover:text-brand-700">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{product.description ?? ""}</p>
        <div className="mt-auto pt-4">
          <DownloadButton productId={product.id} price={product.price} />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
