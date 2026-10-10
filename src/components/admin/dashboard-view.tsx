"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { getResourceStats } from "@/services/admin-catalog-service";
import { ErrorState } from "@/components/ui/states";

export function DashboardView() {
  const state = useQuery("admin-resource-stats", getResourceStats);
  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;
  const s = state.data;

  const cards = [
    ["Tổng tài nguyên", s.total],
    ["Miễn phí", s.free],
    ["Trả phí", s.paid],
    ["Đang ẩn", s.hidden],
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
        <Link href="/admin/products/new/" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700">
          Thêm tài nguyên
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-neutral-200 p-4">
            <p className="text-sm text-neutral-600">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
