"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
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
import { Modal } from "@/components/utilities/modal";
import { CheckIcon, CopyIcon, ImageIcon, PlusIcon, SearchIcon } from "@/components/utilities/tool-icons";
import { formatDateTime } from "@/utils/labels";

const VARIABLE = /\{\{\s*([^{}]+?)\s*\}\}/g;

function findVariables(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(VARIABLE)) {
    const value = match[1]?.trim();
    if (value) names.add(value);
  }
  return [...names];
}

function fillPrompt(text: string, values: Record<string, string>): string {
  return text.replace(VARIABLE, (match, name: string) => values[name.trim()]?.trim() || match);
}

/** Hiển thị kết quả, tô sáng các biến chưa điền để dễ nhận ra. */
function renderResult(text: string, values: Record<string, string>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(VARIABLE)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    const name = match[1]?.trim() ?? "";
    const filled = values[name]?.trim();
    nodes.push(
      filled ? (
        <span key={index++} className="rounded bg-slate-900 px-1 text-white">{filled}</span>
      ) : (
        <mark key={index++} className="rounded bg-amber-100 px-1 text-amber-900">{match[0]}</mark>
      ),
    );
    last = at + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase();

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function PromptImageHoverZoom({
  src,
  alt,
  className,
  wrapperClassName = "inline-block shrink-0",
}: {
  src: string;
  alt: string;
  className: string;
  wrapperClassName?: string;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number; backgroundSize: string; backgroundPosition: string } | null>(null);
  const lensSize = 112;
  const zoom = 2.4;

  function updateZoom(clientX: number, clientY: number) {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    const rect = image.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const cropX = (renderedWidth - rect.width) / 2;
    const cropY = (renderedHeight - rect.height) / 2;
    setPoint({
      x,
      y,
      backgroundSize: `${renderedWidth * zoom}px ${renderedHeight * zoom}px`,
      backgroundPosition: `${lensSize / 2 - (x + cropX) * zoom}px ${lensSize / 2 - (y + cropY) * zoom}px`,
    });
  }

  return (
    <div className={`relative z-0 hover:z-30 focus-within:z-30 ${wrapperClassName}`}>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        tabIndex={0}
        onPointerMove={(event) => { if (event.pointerType === "mouse") updateZoom(event.clientX, event.clientY); }}
        onPointerLeave={() => setPoint(null)}
        onFocus={() => {
          const rect = imageRef.current?.getBoundingClientRect();
          if (rect) updateZoom(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }}
        onBlur={() => setPoint(null)}
        className={`${className} block cursor-zoom-in`}
      />
      {point && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            left: point.x,
            top: point.y,
            width: lensSize,
            height: lensSize,
            backgroundImage: `url("${src}")`,
            backgroundRepeat: "no-repeat",
            backgroundSize: point.backgroundSize,
            backgroundPosition: point.backgroundPosition,
            boxShadow: "0 4px 20px rgba(15, 23, 42, 0.3)",
          }}
        />
      )}
    </div>
  );
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

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100";

function PromptCard({
  prompt,
  isAdmin,
  deleting,
  onOpen,
  onCopy,
  onDelete,
}: {
  prompt: CommunityPrompt;
  isAdmin: boolean;
  deleting: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const variableCount = findVariables(prompt.content).length;
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md">
      <button type="button" onClick={onOpen} aria-label={`Mở prompt ${prompt.title}`} className="relative block aspect-[16/10] w-full overflow-hidden bg-slate-100 text-left">
        {prompt.image_path ? (
          <img
            src={communityPromptImageUrl(prompt.image_path)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-100 to-slate-200 text-3xl font-semibold text-slate-400">Aa</span>
        )}
        {variableCount > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-black/80 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            {variableCount} biến
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-1 font-semibold text-slate-900">{prompt.title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Nghệ nhân {prompt.creator_name} · {formatDateTime(prompt.created_at)}
        </p>
        <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{prompt.content}</p>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <button type="button" onClick={onOpen} className="h-10 flex-1 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-slate-700">
            Dùng prompt
          </button>
          <button type="button" onClick={onCopy} aria-label="Sao chép nội dung gốc" title="Sao chép nội dung gốc" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-slate-400 hover:text-slate-900">
            <CopyIcon className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button type="button" disabled={deleting} onClick={onDelete} className="h-10 rounded-xl px-2 text-xs font-medium text-red-600 underline-offset-2 hover:underline disabled:opacity-50">
              {deleting ? "Đang xóa…" : "Xóa"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function PromptUtility() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CommunityPrompt | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const isAdmin = Boolean(user) && adminUserId === user?.id;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageData, setImageData] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const state = useQuery(`community-prompts:${page}:${version}`, () => listCommunityPrompts(page));
  const totalPages = state.status === "success" ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1;

  const visible = useMemo(() => {
    if (state.status !== "success") return [];
    const needle = fold(search.trim());
    if (!needle) return state.data.items;
    return state.data.items.filter((item) => fold(`${item.title} ${item.content} ${item.creator_name}`).includes(needle));
  }, [state, search]);

  const variables = useMemo(() => findVariables(selected?.content ?? ""), [selected?.content]);
  const result = useMemo(() => fillPrompt(selected?.content ?? "", values), [selected?.content, values]);
  const missing = useMemo(() => variables.filter((name) => !values[name]?.trim()).length, [variables, values]);
  const draftVariables = useMemo(() => findVariables(content), [content]);

  useEffect(() => {
    if (!user) return;
    let current = true;
    getMyRole(user.id)
      .then((role) => { if (current) setAdminUserId(role === "admin" ? user.id : null); })
      .catch(() => { if (current) setAdminUserId(null); });
    return () => { current = false; };
  }, [user]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  function openPrompt(prompt: CommunityPrompt) {
    setSelected(prompt);
    setValues({});
    setCopied(false);
  }

  async function copyOriginal(prompt: CommunityPrompt) {
    showToast((await copyText(prompt.content)) ? "Đã sao chép prompt gốc." : "Trình duyệt chưa cho phép sao chép.", true);
  }

  async function copyResult() {
    if (!result.trim()) return;
    if (await copyText(result)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      showToast("Trình duyệt chưa cho phép sao chép.", false);
    }
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    setFormError("");
    try {
      setImageData(await compressIllustration(file));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Không xử lý được hình ảnh.");
    }
  }

  function onDropImage(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    void chooseImage(event.dataTransfer.files[0]);
  }

  async function uploadPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (!title.trim() || !content.trim()) {
      setFormError("Nhập tiêu đề và nội dung prompt.");
      return;
    }
    setUploading(true);
    setFormError("");
    try {
      await createCommunityPrompt({ userId: user.id, title: title.trim(), content: content.trim(), imageData });
      setTitle("");
      setContent("");
      setImageData(undefined);
      setSearch("");
      setPage(1);
      setVersion((current) => current + 1);
      setUploadOpen(false);
      showToast("Prompt đã được đăng lên thư viện.");
    } catch (err) {
      console.error(err);
      setFormError("Chưa đăng được prompt. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  }

  async function removePrompt(prompt: CommunityPrompt) {
    if (!window.confirm(`Xóa prompt “${prompt.title}” khỏi thư viện?`)) return;
    setDeletingId(prompt.id);
    try {
      await deleteCommunityPrompt(prompt.id);
      if (selected?.id === prompt.id) setSelected(null);
      if (state.status === "success" && state.data.items.length === 1 && page > 1) setPage((current) => current - 1);
      else setVersion((current) => current + 1);
      showToast("Đã xóa prompt.");
    } catch (err) {
      console.error(err);
      showToast("Không xóa được prompt. Vui lòng thử lại.", false);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tiêu đề, nội dung hoặc tác giả…"
            aria-label="Tìm prompt"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={() => { setUploadOpen(true); setFormError(""); }}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          <PlusIcon className="h-4 w-4" /> Đăng prompt
        </button>
      </div>

      {state.status === "success" && (
        <p className="text-sm text-slate-500">
          {search.trim() ? `${visible.length} kết quả trong trang này` : `${state.data.total} prompt trong thư viện`}
        </p>
      )}

      {state.status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Đang tải">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="animate-pulse overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="aspect-[16/10] bg-slate-100" />
              <div className="space-y-2 p-5">
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="h-3 w-full rounded bg-slate-100" />
                <div className="h-3 w-4/5 rounded bg-slate-100" />
                <div className="mt-4 h-10 rounded-xl bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      )}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.total === 0 && (
        <EmptyState title="Chưa có prompt nào" description="Đăng prompt đầu tiên để chia sẻ với mọi người." />
      )}
      {state.status === "success" && state.data.total > 0 && visible.length === 0 && (
        <EmptyState title="Không tìm thấy prompt phù hợp" description="Thử từ khóa khác, hoặc chuyển sang trang khác của thư viện." />
      )}
      {visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              isAdmin={isAdmin}
              deleting={deletingId === prompt.id}
              onOpen={() => openPrompt(prompt)}
              onCopy={() => void copyOriginal(prompt)}
              onDelete={() => void removePrompt(prompt)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium transition hover:border-slate-400 disabled:opacity-40">Trước</button>
          <span className="text-sm tabular-nums text-slate-500">Trang {page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium transition hover:border-slate-400 disabled:opacity-40">Sau</button>
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        description={selected ? `bởi Nghệ nhân ${selected.creator_name}` : undefined}
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            {selected.image_path && (
              <PromptImageHoverZoom
                src={communityPromptImageUrl(selected.image_path)}
                alt={`Ảnh minh họa: ${selected.title}`}
                className="max-h-72 w-full rounded-2xl bg-slate-100 object-cover"
                wrapperClassName="block w-full"
              />
            )}
            {variables.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-900">Điền các biến</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {variables.map((variable) => (
                    <label key={variable} className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">{variable}</span>
                      <input
                        value={values[variable] ?? ""}
                        onChange={(event) => setValues((current) => ({ ...current, [variable]: event.target.value }))}
                        placeholder={`Nhập ${variable}`}
                        className={inputClass}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Kết quả</p>
                {variables.length > 0 && (
                  <span className={`text-xs ${missing ? "text-amber-700" : "text-emerald-700"}`}>
                    {missing ? `Còn ${missing} biến chưa điền` : "Đã điền đủ biến"}
                  </span>
                )}
              </div>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {renderResult(selected.content, values)}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">Đăng lúc {formatDateTime(selected.created_at)}</p>
              <button
                type="button"
                onClick={() => void copyResult()}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                {copied ? "Đã sao chép" : "Sao chép kết quả"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Đăng prompt" description="Dùng {{tên biến}} để tạo ô điền nhanh cho người dùng.">
        {!authLoading && !user ? (
          <p className="text-sm text-slate-600">
            <Link href="/login/" className="font-medium text-slate-900 underline">Đăng nhập</Link> để chia sẻ prompt.
          </p>
        ) : (
          <form onSubmit={(event) => void uploadPrompt(event)} className="space-y-4">
            <div>
              <label htmlFor="community-prompt-title" className="mb-2 block text-sm font-medium">Tiêu đề</label>
              <input id="community-prompt-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Ví dụ: Tạo ảnh sản phẩm" className={inputClass} />
            </div>
            <div>
              <label htmlFor="community-prompt-content" className="mb-2 block text-sm font-medium">Nội dung</label>
              <textarea id="community-prompt-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} required rows={5} placeholder="Hãy tạo cho tôi một quả cam màu {{màu}}" className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="flex flex-wrap items-center gap-1.5">
                  {draftVariables.length > 0 ? (
                    <>
                      Biến:
                      {draftVariables.map((name) => (
                        <span key={name} className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{name}</span>
                      ))}
                    </>
                  ) : (
                    "Chưa có biến nào"
                  )}
                </span>
                <span className="tabular-nums">{content.length}/5000</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Ảnh minh họa <span className="font-normal text-slate-400">(không bắt buộc)</span></p>
              {imageData ? (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                  <img src={imageData} alt="Ảnh minh họa đã nén" className="h-16 w-16 rounded-xl object-cover" />
                  <p className="flex-1 text-sm text-slate-600">Ảnh đã được thu nhỏ và nén tự động.</p>
                  <button type="button" onClick={() => setImageData(undefined)} className="text-sm text-slate-500 underline">Bỏ ảnh</button>
                </div>
              ) : (
                <label
                  onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDropImage}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-dashed px-4 py-6 text-center text-sm transition ${dragOver ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-500 hover:bg-slate-50"}`}
                >
                  <ImageIcon className="h-6 w-6 text-slate-400" />
                  <span className="font-medium text-slate-700">Kéo ảnh vào đây hoặc bấm để chọn</span>
                  <span className="text-xs text-slate-400">Tối đa 15 MB · tự động nén</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={(event) => void chooseImage(event.target.files?.[0])} />
                </label>
              )}
            </div>
            {formError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setUploadOpen(false)} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100">Hủy</button>
              <button type="submit" disabled={uploading || authLoading} className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
                {uploading ? "Đang đăng…" : "Đăng lên thư viện"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {toast && (
        <div role="status" className={`toast-in fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 text-sm font-medium shadow-lg ${toast.ok ? "bg-black text-white" : "bg-red-600 text-white"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
