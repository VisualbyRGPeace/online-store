import type { Metadata } from "next";
import { ProductsAdmin } from "@/components/admin/products-admin";

export const metadata: Metadata = { title: "Sản phẩm" };

export default function Page() {
  return <ProductsAdmin />;
}
