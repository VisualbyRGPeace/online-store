import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderDetailView } from "@/components/orders-view";

export const metadata: Metadata = { title: "Chi tiết đơn hàng" };

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-neutral-200" />}>
      <OrderDetailView />
    </Suspense>
  );
}
