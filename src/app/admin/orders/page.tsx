import type { Metadata } from "next";
import { OrdersAdmin } from "@/components/admin/orders-admin";

export const metadata: Metadata = { title: "Đơn hàng" };

export default function Page() {
  return <OrdersAdmin />;
}
