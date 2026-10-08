"use client";

import { useQuery } from "@/hooks/use-query";
import { listProducts } from "@/services/product-service";
import { ProductGrid } from "@/components/product-card";
import { EmptyState, ErrorState, ProductGridSkeleton } from "@/components/ui/states";

export function LatestProducts() {
  const state = useQuery("latest-products", () => listProducts({ page: 1, pageSize: 8 }));

  if (state.status === "loading") return <ProductGridSkeleton />;
  if (state.status === "error") return <ErrorState />;
  if (state.data.items.length === 0) {
    return <EmptyState title="Chưa có sản phẩm" description="Cửa hàng đang cập nhật, vui lòng quay lại sau." />;
  }
  return <ProductGrid products={state.data.items} />;
}
