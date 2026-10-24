"use client";

import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FormMessage } from "@/components/ui/form";
import { deleteAdminQrHistory, listAdminQrHistory } from "@/services/qr-history-service";
import { formatDateTime } from "@/utils/labels";

export function QrHistoryAdmin() {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = useQuery(`admin-qr-history:${page}:${version}`, () => listAdminQrHistory(page));
  const totalPages = state.status === "success" ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1;

  async function remove(id: string) {
    if (!window.confirm("Xóa nội dung mã QR này khỏi lịch sử?")) return;
    setError(null);
    setDeletingId(id);
    try {
      await deleteAdminQrHistory(id);
      if (state.status === "success" && state.data.items.length === 1 && page > 1) setPage((current) => current - 1);
      else setVersion((current) => current + 1);
    } catch (err) {
      console.error(err);
      setError("Chưa xóa được nội dung. Vui lòng thử lại.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lịch sử mã QR</h1>
        <p className="mt-1 text-sm text-slate-500">Nội dung được lưu khi thành viên tải mã QR.</p>
      </div>

      {error && <FormMessage kind="error">{error}</FormMessage>}
      {state.status === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.total === 0 && <EmptyState title="Chưa có nội dung mã QR" description="Nội dung sẽ xuất hiện khi thành viên tải mã QR." />}
      {state.status === "success" && state.data.total > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{state.data.total} nội dung</span>
            <span>Trang {page}/{totalPages}</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="whitespace-nowrap p-3 font-medium">Thời điểm</th>
                  <th className="p-3 font-medium">Thành viên</th>
                  <th className="p-3 font-medium">Nội dung</th>
                  <th className="p-3 font-medium"><span className="sr-only">Thao tác</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap p-3">{formatDateTime(item.created_at)}</td>
                    <td className="whitespace-nowrap p-3 font-medium text-slate-900">{item.member_name}</td>
                    <td className="max-w-xl whitespace-pre-wrap break-all p-3 leading-6 text-slate-600">{item.content}</td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <button type="button" disabled={deletingId === item.id} onClick={() => void remove(item.id)} className="text-red-600 underline disabled:opacity-50">
                        {deletingId === item.id ? "Đang xóa…" : "Xóa"}
                      </button>
                    </td>
                  </tr>
                ))}
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
