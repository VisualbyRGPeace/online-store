import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductDetailView } from "@/components/product-detail-view";

export const metadata: Metadata = { title: "Chi tiết tài nguyên" };

export default function ProductPage() {
  return (
    <Suspense fallback={<div className="aspect-square max-w-md animate-pulse rounded-lg bg-neutral-200" />}>
      <ProductDetailView />
    </Suspense>
  );
}
