"use client";

import { useQuery } from "@/hooks/use-query";
import { listAllAdminGifGenerationHistory } from "@/services/gif-history-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDateTime } from "@/utils/labels";

export function GifHistoryAdmin() {
  const state = useQuery("admin-gif-history-feed", listAllAdminGifGenerationHistory);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Lịch sử GIF</h1>
        <p className="mt-1 text-sm text-slate-500">GIF mới nhất của các thành viên, tối đa 10 bản cho mỗi tài khoản.</p>
      </header>

      {state.status === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.length === 0 && (
        <EmptyState title="Chưa có GIF nào" description="Lịch sử sẽ xuất hiện khi thành viên đăng nhập và tạo GIF." />
      )}
      {state.status === "success" && state.data.length > 0 && (
        <>
          <p className="text-sm text-slate-500">{state.data.length} GIF gần đây</p>
          <ol className="space-y-3">
            {state.data.map((item) => (
              <li key={item.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
                {item.preview_url ? (
                  <a href={item.preview_url} target="_blank" rel="noreferrer" className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img src={item.preview_url} alt={item.gif_filename} className="h-full w-full object-contain" />
                  </a>
                ) : (
                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">GIF</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all font-semibold text-slate-900">{item.gif_filename}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.member_name}</p>
                      <p className="break-all text-xs text-slate-500">{item.member_email}</p>
                    </div>
                    <time className="whitespace-nowrap text-xs text-slate-500" dateTime={item.created_at}>
                      {formatDateTime(item.created_at)}
                    </time>
                  </div>
                  <p className="mt-3 break-all text-sm text-slate-600">Video: {item.source_filename}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {Number(item.duration_seconds).toFixed(1)} giây · {(item.output_size_bytes / 1024).toFixed(0)} KB · {item.output_quality}
                  </p>
                  {item.caption && <p className="mt-1 break-words text-sm text-slate-600">Chữ: {item.caption}</p>}
                  {item.preview_url && (
                    <a href={item.preview_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium underline">
                      Mở / tải GIF
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
