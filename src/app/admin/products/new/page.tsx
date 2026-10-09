import type { Metadata } from "next";
import { NewProductView } from "@/components/admin/product-pages";

export const metadata: Metadata = { title: "Thêm sản phẩm" };

export default function Page() {
  return <NewProductView />;
}
