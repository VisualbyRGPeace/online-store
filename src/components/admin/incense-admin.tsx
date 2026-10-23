"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FormMessage } from "@/components/ui/form";
import { deleteAdminIncense, listAdminIncense } from "@/services/incense-service";
import { formatDateTime } from "@/utils/labels";

export function IncenseAdmin() {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useQuery(`admin-incense:${page}:${version}`, () => listAdminIncense(page));
  const totalPages = state.status === "success" ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function remove(id: string, donorName: string) {
    if (!window.confirm(`Xóa nén nhang của ${donorName}? Thao tác này không thể hoàn tác.`)) return;
    setError(null);
    setDeletingId(id);
    try {
      await deleteAdminIncense(id);
      if (state.status === "success" && state.data.items.length === 1 && page > 1) setPage((current) => current - 1);
      else setVersion((current) => current + 1);
    } catch (err) {
      console.error(err);
      setError("Chưa xóa được nén nhang. Vui lòng thử lại.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quản lý nhang</h1>
        <p className="mt-1 text-sm text-slate-500">Xem người cúng, lời khẩn cầu, thời điểm thắp và trạng thái từng nén nhang.</p>
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {state.status === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.total === 0 && <EmptyState title="Chưa có nén nhang nào" description="Nhang được thắp sẽ xuất hiện tại đây." />}
      {state.status === "success" && state.data.total > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{state.data.total} nén nhang</span>
            <span>Trang {page}/{totalPages}</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3 font-medium">Thời điểm thắp</th>
                  <th className="p-3 font-medium">Người cúng</th>
                  <th className="p-3 font-medium">Lời khẩn cầu</th>
                  <th className="p-3 font-medium">Trạng thái</th>
                  <th className="p-3 font-medium"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.data.items.map((item) => {
                  const burning = new Date(item.expires_at).getTime() > now;
                  return (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap p-3">{formatDateTime(item.lit_at)}</td>
                      <td className="p-3 font-medium text-slate-900">{item.donor_name}</td>
                      <td className="max-w-sm whitespace-normal p-3 leading-6 text-slate-600">{item.message_text}</td>
                      <td className="whitespace-nowrap p-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${burning ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                          {burning ? "Đang cháy" : "Đã cháy hết"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-3 text-right">
                        <button type="button" disabled={deletingId === item.id} onClick={() => void remove(item.id, item.donor_name)} className="text-red-600 underline disabled:opacity-50">
                          {deletingId === item.id ? "Đang xóa…" : "Xóa"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Trước</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Sau</button>
          </div>
        </>
      )}
    </div>
  );
}
