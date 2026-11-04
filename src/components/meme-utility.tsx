"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { AuthGate } from "@/components/auth-gate";
import { useQuery } from "@/hooks/use-query";
import { getMyRole } from "@/services/admin-order-service";
import {
  MAX_MEME_BYTES,
  deleteMemeGif,
  listMemeGifs,
  uploadMemeGif,
  type MemeGif,
} from "@/services/meme-gif-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Modal } from "@/components/utilities/modal";
import { CopyIcon, TrashIcon, UploadIcon } from "@/components/utilities/tool-icons";
import { copyGif } from "@/utils/copy-gif";

const GRID = "columns-2 gap-1.5 sm:columns-3 lg:columns-4 xl:columns-5";

function readGifSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });
}

function MemeSkeleton() {
  const heights = ["h-40", "h-56", "h-32", "h-48", "h-36", "h-52", "h-44", "h-28", "h-60", "h-40"];
  return (
    <div className={GRID} aria-busy="true" aria-label="Đang tải">
      {heights.map((height, index) => (
        <div key={index} className={`mb-1.5 w-full animate-pulse break-inside-avoid rounded-xl bg-slate-200 ${height}`} />
      ))}
    </div>
  );
}

function MemeTile({
  gif,
  isAdmin,
  onCopy,
  onDelete,
}: {
  gif: MemeGif;
  isAdmin: boolean;
  onCopy: (gif: MemeGif) => void;
  onDelete: (gif: MemeGif) => void;
}) {
  const ratio = gif.width && gif.height ? { aspectRatio: `${gif.width} / ${gif.height}` } : undefined;

  /** Giữ nguyên cách kéo ảnh mặc định của trình duyệt, chỉ bổ sung để thả ra máy / ô chat được dưới dạng tệp .gif. */
  function handleDragStart(event: DragEvent<HTMLImageElement>) {
    event.dataTransfer.setData("DownloadURL", `image/gif:meme-${gif.id.slice(0, 8)}.gif:${gif.url}`);
  }

  const overlay =
    "absolute grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white md:opacity-0 md:group-hover:opacity-100";

  return (
    <div
      className="group relative mx-auto mb-1.5 w-1/2 break-inside-avoid overflow-hidden rounded-xl bg-slate-100"
      style={ratio}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={gif.url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable
        onDragStart={handleDragStart}
        onClick={() => onCopy(gif)}
        className="block h-full w-full cursor-pointer select-none object-cover"
      />
      <button type="button" onClick={() => onCopy(gif)} aria-label="Sao chép GIF" title="Sao chép" className={`${overlay} bottom-2 right-2`}>
        <CopyIcon className="h-[18px] w-[18px]" />
      </button>
      {isAdmin && (
        <button type="button" onClick={() => onDelete(gif)} aria-label="Xóa GIF" title="Xóa" className={`${overlay} right-2 top-2 hover:bg-red-600`}>
          <TrashIcon className="h-[18px] w-[18px]" />
        </button>
      )}
    </div>
  );
}

function MemeBoard({ userId }: { userId: string }) {
  const [version, setVersion] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MemeGif | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  const state = useQuery(`meme-gifs:${version}`, listMemeGifs);

  useEffect(() => {
    let current = true;
    getMyRole(userId)
      .then((role) => { if (current) setIsAdmin(role === "admin"); })
      .catch(() => { if (current) setIsAdmin(false); });
    return () => { current = false; };
  }, [userId]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  async function handleCopy(gif: MemeGif) {
    const ok = await copyGif(gif.url);
    showToast(ok ? "Đã sao chép GIF." : "Trình duyệt chưa cho phép sao chép.", ok);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      if (!file) continue;
      const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
      if (!isGif || file.size > MAX_MEME_BYTES) {
        skipped += 1;
        continue;
      }
      setUploading(`Đang tải ${index + 1}/${list.length}…`);
      try {
        await uploadMemeGif(userId, file, await readGifSize(file));
        added += 1;
      } catch (err) {
        console.error(err);
        failed += 1;
      }
    }

    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
    if (added > 0) setVersion((value) => value + 1);

    const parts: string[] = [];
    if (added > 0) parts.push(`Đã thêm ${added} GIF`);
    if (skipped > 0) parts.push(`${skipped} tệp bị bỏ qua (chỉ nhận .gif, tối đa 10 MB)`);
    if (failed > 0) parts.push(`${failed} tệp tải lỗi`);
    showToast(parts.join(". ") + ".", failed === 0 && skipped === 0);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteMemeGif(deleting);
      setDeleting(null);
      setVersion((value) => value + 1);
      showToast("Đã xóa GIF.");
    } catch (err) {
      console.error(err);
      showToast("Không xóa được GIF.", false);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Bấm vào ảnh để sao chép · Kéo ảnh sang ô chat để dán ngay</p>
        {isAdmin && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/gif"
              multiple
              hidden
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <button
              type="button"
              disabled={uploading !== null}
              onClick={() => fileInput.current?.click()}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              <UploadIcon className="h-4 w-4" />
              {uploading ?? "Tải GIF lên"}
            </button>
          </>
        )}
      </div>

      {state.status === "loading" && <MemeSkeleton />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" &&
        (state.data.length === 0 ? (
          <EmptyState
            title="Chưa có GIF nào"
            description={isAdmin ? "Bấm “Tải GIF lên” để thêm GIF đầu tiên." : "Quản trị viên sẽ sớm thêm GIF vào đây."}
          />
        ) : (
          <div className={GRID}>
            {state.data.map((gif) => (
              <MemeTile key={gif.id} gif={gif} isAdmin={isAdmin} onCopy={handleCopy} onDelete={setDeleting} />
            ))}
          </div>
        ))}

      <Modal open={deleting !== null} onClose={() => (deleteBusy ? undefined : setDeleting(null))} title="Xóa GIF này?">
        {deleting && (
          <div className="space-y-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={deleting.url} alt="" className="mx-auto max-h-60 rounded-xl" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} disabled={deleteBusy} className="h-11 rounded-xl px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
                Hủy
              </button>
              <button type="button" onClick={() => void confirmDelete()} disabled={deleteBusy} className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                {deleteBusy ? "Đang xóa…" : "Xóa"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {toast && (
        <div role="status" className={`toast-in fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-medium shadow-lg ${toast.ok ? "bg-black text-white" : "bg-red-600 text-white"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

export function MemeUtility() {
  return <AuthGate>{(userId) => <MemeBoard userId={userId} />}</AuthGate>;
}
