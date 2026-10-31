"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@/hooks/use-query";
import { getMyRole } from "@/services/admin-order-service";
import {
  communityPromptImageUrl,
  createCommunityPrompt,
  deleteCommunityPrompt,
  listCommunityPrompts,
  updateCommunityPrompt,
  type CommunityPrompt,
} from "@/services/community-prompt-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Modal } from "@/components/utilities/modal";
import { ArrowRightIcon, CheckIcon, CopyImageIcon, CopyTextIcon, EditIcon, ImageIcon, PlusIcon, SearchIcon } from "@/components/utilities/tool-icons";
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

/** Clipboard chỉ nhận ảnh PNG, nên ảnh WebP của prompt được đổi sang PNG trước khi sao chép. */
async function imageToPng(url: string): Promise<Blob> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("image_fetch_failed");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("encode_failed");
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Sao chép riêng ảnh mẫu. Thumbnail không bao giờ được sao chép. */
async function copyImage(imageUrl: string): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": imageToPng(imageUrl) })]);
    return true;
  } catch {
    return false;
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
    const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
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
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không xử lý được hình ảnh.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46, 0.36, 0.26, 0.16, 0.1]) {
      const compressed = canvas.toDataURL("image/webp", quality);
      if (compressed.length <= 480_000) return compressed;
    }
    throw new Error("Ảnh vượt giới hạn dung lượng khi giữ nguyên kích thước.");
  } finally {
    bitmap.close();
  }
}

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100";

function ImagePicker({
  title,
  src,
  onFile,
  onRemove,
}: {
  title: string;
  src: string | null;
  onFile: (file?: File) => void;
  onRemove: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div>
      <p className="text-sm font-medium">
        {title}
      </p>
      {src ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
          <img src={src} alt={title} className="h-16 w-16 rounded-xl object-cover" />
          <label className="cursor-pointer text-sm text-slate-700 underline">
            Đổi ảnh
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <button type="button" onClick={onRemove} className="text-sm text-slate-500 underline">Bỏ ảnh</button>
        </div>
      ) : (
        <label
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragOver(false); onFile(event.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-dashed px-4 py-5 text-center text-sm transition ${dragOver ? "border-slate-900 bg-slate-50" : "border-slate-300 hover:border-slate-500 hover:bg-slate-50"}`}
        >
          <ImageIcon className="h-6 w-6 text-slate-400" />
          <span className="font-medium text-slate-700">Chọn ảnh</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}

/** Prompt dài chỉ hiện 6 dòng đầu; có nút "Xem toàn bộ" để mở hết. Prompt ngắn không có nút. */
function CollapsiblePrompt({ text }: { text: string }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-sm font-semibold text-slate-900">Prompt</p>
      <p ref={textRef} className={`whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 ${expanded ? "" : "line-clamp-6"}`}>
        {text}
      </p>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 transition hover:text-slate-600"
        >
          {expanded ? "Thu gọn" : "Xem toàn bộ"}
          <ArrowRightIcon className={`h-4 w-4 ${expanded ? "-rotate-90" : "rotate-90"}`} />
        </button>
      )}
    </div>
  );
}

function PromptCard({
  prompt,
  isAdmin,
  canEdit,
  deleting,
  onOpen,
  onCopy,
  onCopyImage,
  onEdit,
  onDelete,
}: {
  prompt: CommunityPrompt;
  isAdmin: boolean;
  canEdit: boolean;
  deleting: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onCopyImage: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md">
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
          <button type="button" onClick={onCopy} aria-label="Sao chép chữ" title="Sao chép chữ" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-slate-400 hover:text-slate-900">
            <CopyTextIcon className="h-[18px] w-[18px]" />
          </button>
          {prompt.reference_image_path && (
            <button type="button" onClick={onCopyImage} aria-label="Sao chép ảnh mẫu" title="Sao chép ảnh mẫu" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-slate-400 hover:text-slate-900">
              <CopyImageIcon className="h-[18px] w-[18px]" />
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={onEdit} aria-label="Sửa" title="Sửa" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:border-slate-400 hover:text-slate-900">
              <EditIcon className="h-[18px] w-[18px]" />
            </button>
          )}
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
  const [copiedImage, setCopiedImage] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityPrompt | null>(null);
  const [existingThumb, setExistingThumb] = useState<string | null>(null);
  const [existingReference, setExistingReference] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [thumbData, setThumbData] = useState<string | undefined>();
  const [referenceData, setReferenceData] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");

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
    setCopiedImage(false);
  }

  async function copyOriginal(prompt: CommunityPrompt) {
    showToast((await copyText(prompt.content)) ? "Đã sao chép chữ." : "Trình duyệt chưa cho phép sao chép.", true);
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

  async function copyReference(prompt: CommunityPrompt, fromModal = false) {
    if (!prompt.reference_image_path) return;
    if (await copyImage(communityPromptImageUrl(prompt.reference_image_path))) {
      if (fromModal) {
        setCopiedImage(true);
        window.setTimeout(() => setCopiedImage(false), 1800);
      } else {
        showToast("Đã sao chép ảnh mẫu.");
      }
    } else {
      showToast("Không thể sao chép ảnh mẫu.", false);
    }
  }

  function openCreate() {
    setEditing(null);
    setExistingThumb(null);
    setExistingReference(null);
    setTitle("");
    setContent("");
    setThumbData(undefined);
    setReferenceData(undefined);
    setFormError("");
    setUploadOpen(true);
  }

  function openEdit(prompt: CommunityPrompt) {
    setSelected(null);
    setEditing(prompt);
    setExistingThumb(prompt.image_path);
    setExistingReference(prompt.reference_image_path);
    setTitle(prompt.title);
    setContent(prompt.content);
    setThumbData(undefined);
    setReferenceData(undefined);
    setFormError("");
    setUploadOpen(true);
  }

  function closeForm() {
    setUploadOpen(false);
  }

  async function chooseImage(kind: "thumb" | "reference", file?: File) {
    if (!file) return;
    setFormError("");
    try {
      if (kind === "thumb") setThumbData(await compressIllustration(file));
      else setReferenceData(await compressIllustration(file));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Không xử lý được hình ảnh.");
    }
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
      if (editing) {
        await updateCommunityPrompt({
          id: editing.id,
          title: title.trim(),
          content: content.trim(),
          thumbnailData: thumbData,
          removeThumbnail: Boolean(editing.image_path) && !existingThumb && !thumbData,
          referenceData,
          removeReference: Boolean(editing.reference_image_path) && !existingReference && !referenceData,
        });
        setVersion((current) => current + 1);
        setUploadOpen(false);
        setEditing(null);
        showToast("Đã lưu thay đổi.");
      } else {
        await createCommunityPrompt({ userId: user.id, title: title.trim(), content: content.trim(), thumbnailData: thumbData, referenceData });
        setTitle("");
        setContent("");
        setThumbData(undefined);
        setReferenceData(undefined);
        setSearch("");
        setPage(1);
        setVersion((current) => current + 1);
        setUploadOpen(false);
        showToast("Prompt đã được đăng lên thư viện.");
      }
    } catch (err) {
      console.error(err);
      setFormError(editing ? "Chưa lưu được thay đổi. Vui lòng thử lại." : "Chưa đăng được prompt. Vui lòng thử lại.");
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
            placeholder="Tìm prompt"
            aria-label="Tìm prompt"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
          />
        </div>
        <button
          type="button"
          onClick={openCreate}
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
        <EmptyState title="Chưa có prompt nào" />
      )}
      {state.status === "success" && state.data.total > 0 && visible.length === 0 && (
        <EmptyState title="Không tìm thấy prompt phù hợp" />
      )}
      {visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              isAdmin={isAdmin}
              canEdit={isAdmin || (Boolean(user) && user?.id === prompt.user_id)}
              deleting={deletingId === prompt.id}
              onOpen={() => openPrompt(prompt)}
              onCopy={() => void copyOriginal(prompt)}
              onCopyImage={() => void copyReference(prompt)}
              onEdit={() => openEdit(prompt)}
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
            <div className={selected.image_path ? "grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]" : "grid grid-cols-1"}>
              {selected.image_path && (
                <PromptImageHoverZoom
                  src={communityPromptImageUrl(selected.image_path)}
                  alt={`Thumbnail: ${selected.title}`}
                  className="h-full w-full rounded-2xl bg-slate-100 object-contain"
                  wrapperClassName="flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                />
              )}
              <CollapsiblePrompt key={selected.id} text={selected.content} />
            </div>
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
            {selected.reference_image_path && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">Ảnh mẫu</p>
                <img
                  src={communityPromptImageUrl(selected.reference_image_path)}
                  alt={`Ảnh mẫu: ${selected.title}`}
                  className="max-h-48 rounded-2xl border border-slate-200 bg-slate-50 object-contain"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-400">Đăng lúc {formatDateTime(selected.created_at)}</p>
              <div className="flex items-center gap-2">
                {(isAdmin || (Boolean(user) && user?.id === selected.user_id)) && (
                  <button
                    type="button"
                    onClick={() => openEdit(selected)}
                    aria-label="Sửa"
                    title="Sửa"
                    className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-900 transition hover:border-slate-900"
                  >
                    <EditIcon className="h-5 w-5" />
                  </button>
                )}
                {selected.reference_image_path && (
                  <button
                    type="button"
                    onClick={() => void copyReference(selected, true)}
                    aria-label="Sao chép ảnh mẫu"
                    title="Sao chép ảnh mẫu"
                    className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-900 transition hover:border-slate-900"
                  >
                    {copiedImage ? <CheckIcon className="h-5 w-5" /> : <CopyImageIcon className="h-5 w-5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void copyResult()}
                  aria-label="Sao chép chữ"
                  title="Sao chép chữ"
                  className="grid h-11 w-11 place-items-center rounded-xl bg-black text-white transition hover:bg-slate-700"
                >
                  {copied ? <CheckIcon className="h-5 w-5" /> : <CopyTextIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={uploadOpen} onClose={closeForm} title={editing ? "Sửa prompt" : "Đăng prompt"} >
        {!authLoading && !user ? (
          <p className="text-sm text-slate-600">
            <Link href="/login/" className="font-medium text-slate-900 underline">Đăng nhập</Link>
          </p>
        ) : (
          <form onSubmit={(event) => void uploadPrompt(event)} className="space-y-4">
            <div>
              <label htmlFor="community-prompt-title" className="mb-2 block text-sm font-medium">Tiêu đề</label>
              <input id="community-prompt-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required  className={inputClass} />
            </div>
            <div>
              <label htmlFor="community-prompt-content" className="mb-2 block text-sm font-medium">Nội dung</label>
              <textarea id="community-prompt-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={5000} required rows={5} className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100" />
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
            <ImagePicker
              title="Ảnh thumbnail"
              src={thumbData ?? (existingThumb ? communityPromptImageUrl(existingThumb) : null)}
              onFile={(file) => void chooseImage("thumb", file)}
              onRemove={() => { setThumbData(undefined); setExistingThumb(null); }}
            />
            <ImagePicker
              title="Ảnh mẫu (phác thảo)"
              src={referenceData ?? (existingReference ? communityPromptImageUrl(existingReference) : null)}
              onFile={(file) => void chooseImage("reference", file)}
              onRemove={() => { setReferenceData(undefined); setExistingReference(null); }}
            />
            {formError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeForm} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100">Hủy</button>
              <button type="submit" disabled={uploading || authLoading} className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">
                {uploading ? (editing ? "Đang lưu…" : "Đang đăng…") : editing ? "Lưu thay đổi" : "Đăng lên thư viện"}
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
