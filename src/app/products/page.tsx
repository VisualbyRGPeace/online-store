import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsView } from "@/components/products-view";
import { ProductGridSkeleton } from "@/components/ui/states";

export const metadata: Metadata = { title: "Tài nguyên" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductGridSkeleton count={12} />}>
      <ProductsView base="/products/" lead={<h1 className="text-xl font-semibold tracking-tight">Tài nguyên</h1>} />
    </Suspense>
  );
}
