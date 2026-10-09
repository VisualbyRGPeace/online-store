"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { getDashboardStats } from "@/services/admin-order-service";
import { ErrorState } from "@/components/ui/states";
import { formatVnd } from "@/utils/format";

export function DashboardView() {
  const state = useQuery("admin-dashboard", getDashboardStats);
  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;
  const s = state.data;

  const cards = [
    ["Tổng sản phẩm", String(s.total_products)],
    ["Tổng đơn hàng", String(s.total_orders)],
    ["Đơn mới (chờ xác nhận)", String(s.new_orders)],
    ["Doanh thu (đã thu tiền)", formatVnd(s.revenue)],
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Tổng quan</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-neutral-200 p-4">
            <p className="text-sm text-neutral-600">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Sản phẩm sắp hết hàng (còn từ 5 trở xuống)</h2>
        {s.low_stock.length === 0 ? (
          <p className="text-sm text-neutral-600">Không có sản phẩm nào sắp hết hàng.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
            {s.low_stock.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 p-3">
                <Link href={`/admin/products/edit/?id=${p.id}`} className="hover:underline">{p.name}</Link>
                <span className={p.stock === 0 ? "font-medium text-red-600" : "text-amber-700"}>
                  {p.stock === 0 ? "Hết hàng" : `Còn ${p.stock}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
