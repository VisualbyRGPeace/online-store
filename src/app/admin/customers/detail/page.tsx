import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerDownloadsView } from "@/components/admin/customer-downloads";

export const metadata: Metadata = { title: "Lịch sử tải" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-slate-200" />}>
      <CustomerDownloadsView />
    </Suspense>
  );
}
