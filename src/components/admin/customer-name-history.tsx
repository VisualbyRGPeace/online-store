"use client";

import { useQuery } from "@/hooks/use-query";
import { listProfileNameHistory } from "@/services/admin-order-service";
import { formatDateTime } from "@/utils/labels";

export function CustomerNameHistory({
  userId,
  email,
  currentName,
  onClose,
}: {
  userId: string;
  email: string;
  currentName: string | null;
  onClose: () => void;
}) {
  const history = useQuery(`admin-name-history:${userId}`, () => listProfileNameHistory(userId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-name-history-title"
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h2 id="customer-name-history-title" className="text-lg font-semibold">Lịch sử đổi tên</h2>
            <p className="mt-1 text-sm text-slate-500">{email}</p>
            <p className="text-sm text-slate-500">Tên hiện tại: {currentName || "—"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100">
            ×
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {history.status === "loading" && <div className="h-24 animate-pulse rounded-xl bg-slate-100" />}
          {history.status === "error" && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              Không tải được lịch sử đổi tên. Hãy kiểm tra migration lịch sử tên trong Supabase đã được chạy chưa.
            </p>
          )}
          {history.status === "success" && history.data.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Chưa có lịch sử đổi tên. Hệ thống bắt đầu ghi nhận từ khi tính năng được cài đặt.
            </p>
          )}
          {history.status === "success" && history.data.length > 0 && (
            <ol className="space-y-3">
              {history.data.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="break-words text-sm font-medium text-slate-900">
                    {item.previous_name || "Chưa đặt tên"}
                    <span className="mx-2 text-slate-400">→</span>
                    {item.new_name || "Đã xóa tên"}
                  </p>
                  <time className="mt-1 block text-xs text-slate-500" dateTime={item.changed_at}>
                    {formatDateTime(item.changed_at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
