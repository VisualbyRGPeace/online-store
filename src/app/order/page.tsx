import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderConfirmationView } from "@/components/order-confirmation-view";

export const metadata: Metadata = { title: "Đơn hàng", robots: { index: false } };

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-neutral-200" />}>
      <OrderConfirmationView />
    </Suspense>
  );
}
