import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsView } from "@/components/products-view";
import { ProductGridSkeleton } from "@/components/ui/states";

export const metadata: Metadata = { title: "Sản phẩm" };

export default function ProductsPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Sản phẩm</h1>
      <Suspense fallback={<ProductGridSkeleton count={12} />}>
        <ProductsView />
      </Suspense>
    </>
  );
}
