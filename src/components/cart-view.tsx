"use client";

import Link from "next/link";
import { useCart } from "@/hooks/use-cart";
import { useQuery } from "@/hooks/use-query";
import { getImageUrls, getProductsByIds } from "@/services/product-service";
import { ProductImage } from "@/components/product-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatVnd } from "@/utils/format";

export function CartView() {
  const { items, setQuantity, remove } = useCart();
  const ids = items.map((i) => i.productId);
  const key = ids.length ? `cart:${[...ids].sort().join(",")}` : "cart:empty";
  const state = useQuery(key, () => (ids.length ? getProductsByIds(ids) : Promise.resolve([])));

  if (items.length === 0) {
    return <EmptyState title="Giỏ hàng trống" description="Hãy chọn vài sản phẩm bạn thích." href="/products/" actionLabel="Tiếp tục mua sắm" />;
  }
  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;

  const byId = new Map(state.data.map((p) => [p.id, p]));
  let subtotal = 0;

  const rows = items.map((item) => {
    const p = byId.get(item.productId);
    if (!p || p.stock <= 0) {
      return (
        <li key={item.productId} className="flex items-center justify-between gap-4 py-4">
          <p className="text-sm text-neutral-600">Sản phẩm này không còn bán hoặc đã hết hàng.</p>
          <button type="button" onClick={() => remove(item.productId)} className="text-sm text-red-600 hover:underline">Xóa</button>
        </li>
      );
    }
    const qty = Math.min(item.quantity, p.stock);
    const line = p.price * qty;
    subtotal += line;
    const image = getImageUrls(p.product_images)[0];
    return (
      <li key={item.productId} className="flex gap-4 py-4">
        <Link href={`/product/?slug=${encodeURIComponent(p.slug)}`} className="h-20 w-20 shrink-0 overflow-hidden rounded">
          <ProductImage src={image} alt={p.name} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/product/?slug=${encodeURIComponent(p.slug)}`} className="line-clamp-2 text-sm font-medium hover:underline">{p.name}</Link>
          <p className="mt-1 text-sm text-neutral-600">{formatVnd(p.price)}</p>
          {item.quantity > p.stock && (
            <p className="mt-1 text-xs text-amber-700">Chỉ còn {p.stock} sản phẩm, số lượng đã được điều chỉnh.</p>
          )}
          <div className="mt-2 flex items-center gap-4">
            <div className="flex items-center rounded-md border border-neutral-300 text-sm">
              <button type="button" aria-label="Giảm" disabled={qty <= 1} onClick={() => setQuantity(p.id, qty - 1)} className="px-2.5 py-1 disabled:opacity-40">−</button>
              <span className="w-8 text-center">{qty}</span>
              <button type="button" aria-label="Tăng" disabled={qty >= p.stock} onClick={() => setQuantity(p.id, qty + 1)} className="px-2.5 py-1 disabled:opacity-40">+</button>
            </div>
            <button type="button" onClick={() => remove(p.id)} className="text-sm text-neutral-500 hover:text-red-600">Xóa</button>
          </div>
        </div>
        <p className="text-sm font-medium">{formatVnd(line)}</p>
      </li>
    );
  });

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <ul className="divide-y divide-neutral-200 lg:col-span-2">{rows}</ul>
      <aside className="h-fit rounded-lg border border-neutral-200 p-5">
        <div className="flex justify-between text-sm">
          <span>Tạm tính</span>
          <span className="font-semibold">{formatVnd(subtotal)}</span>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Phí vận chuyển và tổng cuối cùng được tính ở bước thanh toán.</p>
        <Link href="/checkout/" className="mt-5 block w-full rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm text-white hover:bg-neutral-700">
          Tiến hành thanh toán
        </Link>
      </aside>
    </div>
  );
}
