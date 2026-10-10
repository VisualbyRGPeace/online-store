import type { Metadata } from "next";
import { ProductsAdmin } from "@/components/admin/products-admin";

export const metadata: Metadata = { title: "Tài nguyên" };

export default function Page() {
  return <ProductsAdmin />;
}
