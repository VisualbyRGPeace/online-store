import Link from "next/link";
import { formatVnd } from "@/utils/format";
import { getImageUrls } from "@/services/product-service";
import type { ProductListItem } from "@/types";

export function ProductImage({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex aspect-square items-center justify-center bg-neutral-100 text-xs text-neutral-400 ${className}`}>
        Chưa có ảnh
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={`aspect-square w-full bg-neutral-100 object-cover ${className}`} />;
}

export function Price({ price, compareAt }: { price: number; compareAt: number | null }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-semibold">{formatVnd(price)}</span>
      {compareAt !== null && compareAt > price && (
        <span className="text-sm text-neutral-500 line-through">{formatVnd(compareAt)}</span>
      )}
    </p>
  );
}

export function ProductCard({ product }: { product: ProductListItem }) {
  const image = getImageUrls(product.product_images)[0];
  return (
    <Link href={`/product/?slug=${encodeURIComponent(product.slug)}`} className="group block">
      <div className="relative overflow-hidden rounded-lg">
        <ProductImage src={image} alt={product.name} className="transition-transform group-hover:scale-105" />
        {product.stock <= 0 && (
          <span className="absolute left-2 top-2 rounded bg-neutral-900 px-2 py-0.5 text-xs text-white">Hết hàng</span>
        )}
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm">{product.name}</h3>
      <div className="mt-1 text-sm">
        <Price price={product.price} compareAt={product.compare_at_price} />
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductListItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
