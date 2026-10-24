"use client";

import { useQuery } from "@/hooks/use-query";
import { listAdminGifGenerationHistory } from "@/services/gif-history-service";
import { formatDateTime } from "@/utils/labels";

export function CustomerGifHistory({
  userId,
  email,
  onClose,
}: {
  userId: string;
  email: string;
  onClose: () => void;
}) {
  const history = useQuery(`admin-gif-history:${userId}`, () => listAdminGifGenerationHistory(userId));

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
        aria-labelledby="customer-gif-history-title"
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 p-5">
          <div>
            <h2 id="customer-gif-history-title" className="text-lg font-semibold">Lịch sử tạo GIF</h2>
            <p className="mt-1 text-sm text-slate-500">{email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100">
            ×
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {history.status === "loading" && <div className="h-24 animate-pulse rounded-xl bg-slate-100" />}
          {history.status === "error" && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              Không tải được lịch sử tạo GIF. Hãy kiểm tra migration lịch sử GIF trong Supabase đã được chạy chưa.
            </p>
          )}
          {history.status === "success" && history.data.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Chưa có lịch sử. GIF tạo thành công sẽ được ghi nhận khi người dùng đăng nhập.
            </p>
          )}
          {history.status === "success" && history.data.length > 0 && (
            <ol className="space-y-3">
              {history.data.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="break-all text-sm font-semibold text-slate-900">{item.gif_filename}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">Video: {item.source_filename}</p>
                    </div>
                    <time className="text-xs text-slate-500" dateTime={item.created_at}>
                      {formatDateTime(item.created_at)}
                    </time>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">
                    {Number(item.duration_seconds).toFixed(1)} giây · {(item.output_size_bytes / 1024).toFixed(0)} KB · {item.output_quality}
                  </p>
                  {item.preview_url && (
                    <div className="mt-3 flex items-center gap-3">
                      <img src={item.preview_url} alt={item.gif_filename} className="h-20 w-20 rounded-lg border border-slate-200 bg-slate-50 object-contain" />
                      <a href={item.preview_url} target="_blank" rel="noreferrer" className="text-sm font-medium underline">
                        Xem / tải GIF
                      </a>
                    </div>
                  )}
                  {item.caption && (
                    <p className="mt-2 break-words text-sm text-slate-600">Chữ: {item.caption}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-slate-400">
            Chỉ lưu 10 GIF mới nhất cho mỗi tài khoản; GIF cũ sẽ tự xóa.
          </p>
        </div>
      </section>
    </div>
  );
}
