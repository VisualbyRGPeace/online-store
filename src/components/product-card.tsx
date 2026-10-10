import Link from "next/link";
import { DownloadButton } from "@/components/download-button";
import { getImageUrls } from "@/services/product-service";
import { formatVnd } from "@/utils/format";
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

export function PriceBadge({ price }: { price: number }) {
  return price === 0 ? (
    <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">Miễn phí</span>
  ) : (
    <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">{formatVnd(price)}</span>
  );
}

export function ProductCard({ product }: { product: ProductListItem }) {
  const image = getImageUrls(product.product_images)[0];
  return (
    <div className="flex flex-col">
      <Link href={`/product/?slug=${encodeURIComponent(product.slug)}`} className="group block">
        <div className="relative overflow-hidden rounded-lg">
          <ProductImage src={image} alt={product.name} className="transition-transform group-hover:scale-105" />
          <span className="absolute left-2 top-2">
            <PriceBadge price={product.price} />
          </span>
        </div>
        <h3 className="mt-3 truncate text-sm font-medium">{product.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-neutral-600">{product.description ?? ""}</p>
      </Link>
      <div className="mt-3">
        <DownloadButton productId={product.id} price={product.price} />
      </div>
    </div>
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
