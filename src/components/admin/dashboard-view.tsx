"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { getResourceStats } from "@/services/admin-catalog-service";
import { ErrorState } from "@/components/ui/states";
import { FREE_LABEL } from "@/lib/site-config";

export function DashboardView() {
  const state = useQuery("admin-resource-stats", getResourceStats);
  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;
  const s = state.data;

  const cards = [
    { label: "Tổng tài nguyên", value: s.total, accent: "bg-black" },
    { label: FREE_LABEL, value: s.free, accent: "bg-slate-600" },
    { label: "Trả phí", value: s.paid, accent: "bg-slate-400" },
    { label: "Đang ẩn", value: s.hidden, accent: "bg-slate-300" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan</h1>
        <Link href="/admin/products/new/" className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
          Thêm tài nguyên
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`absolute inset-y-0 left-0 w-1 ${c.accent}`} aria-hidden />
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
