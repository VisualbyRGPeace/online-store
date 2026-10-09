import type { Metadata } from "next";
import { CategoriesAdmin } from "@/components/admin/categories-admin";

export const metadata: Metadata = { title: "Danh mục" };

export default function Page() {
  return <CategoriesAdmin />;
}
