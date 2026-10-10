"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { getCardImage, listProducts } from "@/services/product-service";
import { ProductImage } from "@/components/product-card";
import { ImageIcon } from "@/components/ui/icons";

/** Four newest resources as a small collage. Empty squares are shown until there is something to show. */
export function HeroShowcase() {
  const state = useQuery("hero-showcase", () => listProducts({ page: 1, pageSize: 4 }));
  const items = state.status === "success" ? state.data.items : [];
  const tiles = Array.from({ length: 4 }, (_, i) => items[i]);

  return (
    <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-4 pb-8" role="group">
      {tiles.map((p, i) => {
        const shift = i % 2 === 1 ? "translate-y-8" : "";
        if (!p) {
          return (
            <div key={i} className={`grid aspect-square place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-300 ${shift}`} aria-hidden>
              <ImageIcon />
            </div>
          );
        }
        const image = getCardImage(p.product_images);
        return (
          <Link
            key={p.id}
            href={`/product/?slug=${encodeURIComponent(p.slug)}`}
            aria-label={p.name}
            className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md transition hover:shadow-xl ${shift}`}
          >
            <ProductImage src={image?.small} fallback={image?.src} alt={p.name} priority />
          </Link>
        );
      })}
    </div>
  );
}
