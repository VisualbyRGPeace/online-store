"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@/hooks/use-query";
import { getMyRole } from "@/services/admin-order-service";
import {
  communityPromptImageUrl,
  createCommunityPrompt,
  deleteCommunityPrompt,
  listCommunityPrompts,
  type CommunityPrompt,
} from "@/services/community-prompt-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDateTime } from "@/utils/labels";

function findVariables(text: string): string[] {
  const names = new Set<string>();
  text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name: string) => {
    const value = name.trim();
    if (value) names.add(value);
    return _match;
  });
  return [...names];
}

function fillPrompt(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) => values[name.trim()]?.trim() || match);
}

async function compressIllustration(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Chọn một tệp hình ảnh.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Ảnh tối đa 15 MB.");

  const bitmap = await createImageBitmap(file);
  try {
    let longestSide = Math.min(720, Math.max(bitmap.width, bitmap.height));
    let latest = "";
    while (longestSide >= 240) {
      const scale = Math.min(1, longestSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Không xử lý được hình ảnh.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.78, 0.66, 0.54]) {
        latest = canvas.toDataURL("image/webp", quality);
        if (latest.length <= 480_000) return latest;
      }
      longestSide = Math.floor(longestSide * 0.78);
    }
    return latest;
  } finally {
    bitmap.close();
  }
}

export function PromptUtility() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageData, setImageData] = useState<string | undefined>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const state = useQuery(`community-prompts:${page}:${version}`, () => listCommunityPrompts(page));
  const selected = state.status === "success" ? state.data.items.find((item) => item.id === selectedId) ?? null : null;
  const variables = useMemo(() => findVariables(selected?.content ?? ""), [selected?.content]);
  const result = useMemo(() => fillPrompt(selected?.content ?? "", values), [selected?.content, values]);
  const totalPages = state.status === "success" ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1;

  useEffect(() => {
    let current = true;
    if (!user) {
      setIsAdmin(false);
      return () => { current = false; };
    }
    getMyRole(user.id)
      .then((role) => { if (current) setIsAdmin(role === "admin"); })
      .catch(() => { if (current) setIsAdmin(false); });
    return () => { current = false; };
  }, [user?.id]);

  async function chooseImage(file?: File) {
    if (!file) return;
    setError("");
    try {
      setImageData(await compressIllustration(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xử lý được hình ảnh.");
    }
  }

  async function uploadPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (!title.trim() || !content.trim()) {
      setError("Nhập tiêu đề và nội dung prompt.");
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      await createCommunityPrompt({
        userId: user.id,
        title: title.trim(),
        content: content.trim(),
        imageData,
      });
      setTitle("");
      setContent("");
      setImageData(undefined);
      setPage(1);
      setVersion((current) => current + 1);
      setNotice("Prompt đã được đăng lên thư viện.");
      setUploadOpen(false);
    } catch (err) {
      console.error(err);
      setError("Chưa đăng được prompt. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  }

  function usePrompt(prompt: CommunityPrompt) {
    setSelectedId(prompt.id);
    setValues({});
    setCopied(false);
    setError("");
  }

  async function removePrompt(prompt: CommunityPrompt) {
    if (!window.confirm(`Xóa prompt “${prompt.title}” khỏi thư viện?`)) return;
    setError("");
    setDeletingId(prompt.id);
    try {
      await deleteCommunityPrompt(prompt.id);
      if (selectedId === prompt.id) setSelectedId(null);
      if (state.status === "success" && state.data.items.length === 1 && page > 1) setPage((current) => current - 1);
      else setVersion((current) => current + 1);
    } catch (err) {
      console.error(err);
      setError("Không xóa được prompt. Vui lòng thử lại.");
    } finally {
      setDeletingId(null);
    }
  }

  async function copyResult() {
    if (!result.trim()) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Trình duyệt chưa cho phép sao chép.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Thư viện prompt</h2>
          {state.status === "success" && <span className="mt-1 block text-sm text-slate-500">{state.data.total} prompt</span>}
        </div>
        <button type="button" onClick={() => { setUploadOpen((open) => !open); setError(""); setNotice(""); }} aria-expanded={uploadOpen} className="inline-flex h-10 shrink-0 items-center rounded-xl bg-black px-4 text-sm font-medium text-white transition hover:bg-slate-700">
          {uploadOpen ? "Đóng tải lên" : "Tải lên prompt"}
        </button>
      </div>
      {uploadOpen && (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Tải lên prompt</h2>
            <p className="mt-1 text-sm text-slate-500">Dùng {"{{tên biến}}"} để tạo ô thay nhanh.</p>
          </div>
          <button type="button" onClick={() => setUploadOpen(false)} className="text-sm text-slate-500 underline">Đóng</button>
        </div>

        {!authLoading && !user ? (
          <p className="text-sm text-slate-600">
            <Link href="/login/" className="font-medium text-slate-900 underline">Đăng nhập</Link> để chia sẻ prompt.
          </p>
        ) : (
          <form onSubmit={(event) => void uploadPrompt(event)} className="space-y-4">
            <div>
              <label htmlFor="community-prompt-title" className="mb-2 block text-sm font-medium">Tiêu đề</label>
              <input id="community-prompt-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Ví dụ: Tạo ảnh sản phẩm" className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label htmlFor="community-prompt-content" className="mb-2 block text-sm font-medium">Nội dung</label>
              <textarea id="community-prompt-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} required rows={5} placeholder="Hãy tạo cho tôi một quả cam màu {{màu}}" className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-slate-200 px-4 text-sm font-medium transition hover:bg-slate-50">
                {imageData ? "Đổi ảnh minh họa" : "Thêm ảnh minh họa"}
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => void chooseImage(event.target.files?.[0])} />
              </label>
              {imageData && (
                <>
                  <img src={imageData} alt="Ảnh minh họa đã nén" className="h-12 w-12 rounded-xl border border-slate-200 object-cover" />
                  <button type="button" onClick={() => setImageData(undefined)} className="text-sm text-slate-500 underline">Bỏ ảnh</button>
                </>
              )}
              <span className="text-xs text-slate-500">Ảnh tự thu nhỏ và nén</span>
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
            <button type="submit" disabled={uploading || authLoading} className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
              {uploading ? "Đang đăng…" : "Đăng lên thư viện"}
            </button>
          </form>
        )}
      </section>
      )}

      {selected && (
        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5 sm:p-7">
          <div className="mb-4 flex items-start gap-3">
            {selected.image_path && <img src={communityPromptImageUrl(selected.image_path)} alt="" className="h-28 w-28 shrink-0 rounded-xl object-cover transition-transform duration-200 hover:z-10 hover:scale-105" />}
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{selected.title}</h2>
              <p className="mt-1 text-xs text-slate-500">by Nghệ nhân {selected.creator_name}</p>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-slate-500 underline">Đóng</button>
          </div>
          {variables.length > 0 && (
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              {variables.map((variable) => (
                <label key={variable} className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">{variable}</span>
                  <input value={values[variable] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [variable]: event.target.value }))} placeholder={`Nhập ${variable}`} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-4 focus:ring-slate-100" />
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{result}</p>
            <button type="button" onClick={() => void copyResult()} className="shrink-0 rounded-xl bg-black px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
              {copied ? "Đã sao chép" : "Sao chép"}
            </button>
          </div>
        </section>
      )}

      <section>
        {error && !user && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
        {state.status === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-busy="true" />}
        {state.status === "error" && <ErrorState />}
        {state.status === "success" && state.data.total === 0 && <EmptyState title="Chưa có prompt nào" description="Tải lên prompt đầu tiên để chia sẻ với mọi người." />}
        {state.status === "success" && state.data.items.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {state.data.items.map((prompt) => (
                <article key={prompt.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    {prompt.image_path ? (
                      <img src={communityPromptImageUrl(prompt.image_path)} alt="" className="h-28 w-28 shrink-0 rounded-xl bg-slate-100 object-cover transition-transform duration-200 hover:z-10 hover:scale-105" />
                    ) : (
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-500">Aa</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900">{prompt.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">by Nghệ nhân {prompt.creator_name}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(prompt.created_at)}</p>
                    </div>
                    {isAdmin && (
                      <button type="button" disabled={deletingId === prompt.id} onClick={() => void removePrompt(prompt)} className="text-xs text-red-600 underline disabled:opacity-50">
                        {deletingId === prompt.id ? "Đang xóa…" : "Xóa"}
                      </button>
                    )}
                  </div>
                  <p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{prompt.content}</p>
                  <button type="button" onClick={() => usePrompt(prompt)} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium transition hover:border-slate-400">
                    Dùng prompt
                  </button>
                </article>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm disabled:opacity-40">Trước</button>
                <span className="text-sm text-slate-500">Trang {page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm disabled:opacity-40">Sau</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
