"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/hooks/use-query";
import { useCart } from "@/hooks/use-cart";
import { getImageUrls, getProductBySlug } from "@/services/product-service";
import { Price, ProductImage } from "@/components/product-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { ProductDetail } from "@/types";

export function ProductDetailView() {
  const slug = useSearchParams().get("slug") ?? "";
  const state = useQuery(`product:${slug}`, () => (slug ? getProductBySlug(slug) : Promise.resolve(null)));

  const title = state.status === "success" && state.data ? `${state.data.name} | Shop` : null;
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  if (state.status === "loading") {
    return <div className="aspect-square max-w-md animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  }
  if (state.status === "error") return <ErrorState />;
  if (!state.data) {
    return <EmptyState title="Không tìm thấy sản phẩm" description="Sản phẩm không tồn tại hoặc đã ngừng bán." href="/products/" actionLabel="Xem sản phẩm khác" />;
  }
  return <ProductContent key={state.data.id} product={state.data} />;
}

function ProductContent({ product }: { product: ProductDetail }) {
  const images = getImageUrls(product.product_images);
  const [selected, setSelected] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const cart = useCart();

  const inCart = cart.items.find((i) => i.productId === product.id)?.quantity ?? 0;
  const available = Math.max(0, product.stock - inCart);
  const outOfStock = product.stock <= 0;
  const safeQty = Math.min(qty, Math.max(available, 1));

  const stockLabel = outOfStock
    ? "Hết hàng"
    : product.stock <= 5
      ? `Chỉ còn ${product.stock} sản phẩm`
      : "Còn hàng";

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <ProductImage src={images[selected]} alt={product.name} className="rounded-lg" />
        {images.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Xem ảnh ${i + 1}`}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded border-2 ${i === selected ? "border-neutral-900" : "border-transparent"}`}
              >
                <ProductImage src={src} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {product.categories && (
          <Link href={`/products/?category=${encodeURIComponent(product.categories.slug)}`} className="text-sm text-neutral-500 hover:underline">
            {product.categories.name}
          </Link>
        )}
        <h1 className="mt-1 text-2xl font-semibold">{product.name}</h1>
        <div className="mt-3 text-xl">
          <Price price={product.price} compareAt={product.compare_at_price} />
        </div>
        <p className={`mt-2 text-sm ${outOfStock ? "text-red-600" : "text-green-700"}`}>{stockLabel}</p>

        <div className="mt-6 flex items-center gap-4">
          <div className="flex items-center rounded-md border border-neutral-300">
            <button type="button" aria-label="Giảm" disabled={safeQty <= 1} onClick={() => setQty(safeQty - 1)} className="px-3 py-2 disabled:opacity-40">−</button>
            <span className="w-10 text-center text-sm" aria-live="polite">{safeQty}</span>
            <button type="button" aria-label="Tăng" disabled={safeQty >= available} onClick={() => setQty(safeQty + 1)} className="px-3 py-2 disabled:opacity-40">+</button>
          </div>
          <button
            type="button"
            disabled={outOfStock || available <= 0}
            onClick={() => {
              cart.add(product.id, safeQty);
              setQty(1);
              setAdded(true);
            }}
            className="flex-1 rounded-md bg-neutral-900 px-5 py-2.5 text-sm text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {outOfStock ? "Hết hàng" : available <= 0 ? "Đã thêm tối đa vào giỏ" : "Thêm vào giỏ"}
          </button>
        </div>
        {added && (
          <p className="mt-3 text-sm text-green-700" role="status">
            Đã thêm vào giỏ. <Link href="/cart/" className="underline">Xem giỏ hàng</Link>
          </p>
        )}

        {product.description && (
          <div className="mt-8 border-t border-neutral-200 pt-6">
            <h2 className="mb-2 font-medium">Mô tả</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
