import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";

export const metadata: Metadata = { title: "Thanh toán", robots: { index: false } };

export default function CheckoutPage() {
  return <CheckoutView />;
}
