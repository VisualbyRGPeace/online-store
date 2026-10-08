import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = { title: "Giỏ hàng" };

export default function CartPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Giỏ hàng</h1>
      <CartView />
    </>
  );
}
