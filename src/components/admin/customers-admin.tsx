"use client";

import { useQuery } from "@/hooks/use-query";
import { listCustomers } from "@/services/admin-order-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDateTime } from "@/utils/labels";

export function CustomersAdmin() {
  const state = useQuery("admin-customers", listCustomers);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Thành viên</h1>
      {state.status === "loading" && <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.length === 0 && <EmptyState title="Chưa có tài khoản nào" />}
      {state.status === "success" && state.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="p-3 font-medium">Họ tên</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Điện thoại</th>
                <th className="p-3 font-medium">Vai trò</th>
                <th className="p-3 font-medium">Đơn</th>
                <th className="p-3 font-medium">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {state.data.map((c) => (
                <tr key={c.id}>
                  <td className="p-3">{c.full_name ?? "—"}</td>
                  <td className="p-3">{c.email}</td>
                  <td className="p-3">{c.phone ?? "—"}</td>
                  <td className="p-3">{c.role === "admin" ? "Quản trị" : "Khách"}</td>
                  <td className="p-3">{c.order_count}</td>
                  <td className="p-3">{formatDateTime(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-neutral-500">Để đổi vai trò tài khoản, dùng SQL trong Supabase (không thể đổi từ trang web, để tránh bị chiếm quyền).</p>
    </div>
  );
}
