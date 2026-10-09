import type { Metadata } from "next";
import { OrdersListView } from "@/components/orders-view";

export const metadata: Metadata = { title: "Đơn hàng của tôi" };

export default function OrdersPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Đơn hàng của tôi</h1>
      <OrdersListView />
    </>
  );
}
