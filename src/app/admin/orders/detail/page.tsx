import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderDetailAdmin } from "@/components/admin/orders-admin";

export const metadata: Metadata = { title: "Chi tiết đơn hàng" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-neutral-200" />}>
      <OrderDetailAdmin />
    </Suspense>
  );
}
