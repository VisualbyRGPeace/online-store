import type { Metadata } from "next";
import { Suspense } from "react";
import { EditProductView } from "@/components/admin/product-pages";

export const metadata: Metadata = { title: "Sửa tài nguyên" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-neutral-200" />}>
      <EditProductView />
    </Suspense>
  );
}
