import type { Metadata } from "next";
import { NewProductView } from "@/components/admin/product-pages";

export const metadata: Metadata = { title: "Thêm tài nguyên" };

export default function Page() {
  return <NewProductView />;
}
