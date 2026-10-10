import { Suspense } from "react";
import { Byline } from "@/components/byline";
import { ProductsView } from "@/components/products-view";
import { ProductGridSkeleton } from "@/components/ui/states";

// The home page IS the library: signature, search, filters and the grid. Nothing else.
export default function HomePage() {
  return (
    <Suspense fallback={<ProductGridSkeleton count={12} />}>
      <ProductsView base="/" lead={<Byline />} />
    </Suspense>
  );
}
