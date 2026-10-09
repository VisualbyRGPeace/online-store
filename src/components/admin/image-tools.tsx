"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_IMAGES_PER_PRODUCT, validateImageFile } from "@/utils/image";
import { adminErrorMessage } from "@/utils/errors";
import { useQuery } from "@/hooks/use-query";
import {
  deleteProductImage,
  listProductImages,
  reorderImages,
  setPrimaryImage,
  uploadProductImages,
} from "@/services/admin-catalog-service";
import { publicImageUrl } from "@/services/product-service";
import { FormMessage, secondaryButton } from "@/components/ui/form";
import { ErrorState } from "@/components/ui/states";

/** Drag & drop / click-to-pick area. Validates type and size, and caps the number of images. */
export function ImageDropzone({ remaining, disabled, onFiles }: { remaining: number; disabled?: boolean; onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function handle(list: FileList | null) {
    if (!list) return;
    const valid: File[] = [];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const problem = validateImageFile(file);
      if (problem) problems.push(problem);
      else if (valid.length >= remaining) problems.push(`Tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh cho mỗi sản phẩm.`);
      else valid.push(file);
    }
    setErrors([...new Set(problems)]);
    if (valid.length) onFiles(valid);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) handle(e.dataTransfer.files); }}
        className={`rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm ${dragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"} ${disabled ? "opacity-50" : ""}`}
      >
        <p>Kéo thả ảnh vào đây hoặc</p>
        <button type="button" disabled={disabled || remaining <= 0} onClick={() => inputRef.current?.click()} className={`${secondaryButton} mt-2`}>
          Chọn ảnh
        </button>
        <p className="mt-2 text-xs text-neutral-500">JPG, PNG hoặc WebP · còn {remaining} chỗ trống</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => { handle(e.target.files); e.target.value = ""; }}
        />
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-600" role="alert">
          {errors.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
    </div>
  );
}

/** New product: images are chosen first and uploaded right after the product is saved. */
export function PendingImages({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Hình ảnh (ảnh đầu tiên là ảnh chính)</p>
      <ImageDropzone remaining={MAX_IMAGES_PER_PRODUCT - files.length} onFiles={(added) => onChange([...files, ...added])} />
      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt="" className="aspect-square w-full rounded object-cover" />
              <button
                type="button"
                aria-label="Bỏ ảnh"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="absolute right-1 top-1 rounded bg-white/90 px-1.5 text-sm shadow"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Edit product: upload, reorder, choose primary, delete. */
export function ImageManager({ productId }: { productId: string }) {
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const state = useQuery(`images:${productId}:${version}`, () => listProductImages(productId));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      setMessage({ kind: "error", text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") return <div className="h-32 animate-pulse rounded-lg bg-neutral-200" />;
  if (state.status === "error") return <ErrorState />;
  const images = state.data;

  function move(index: number, dir: -1 | 1) {
    const ids = images.map((i) => i.id);
    const a = ids[index];
    const b = ids[index + dir];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[index + dir] = a;
    void run(() => reorderImages(ids));
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Hình ảnh sản phẩm</h2>
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      <ImageDropzone
        remaining={MAX_IMAGES_PER_PRODUCT - images.length}
        disabled={busy}
        onFiles={(files) =>
          run(async () => {
            const result = await uploadProductImages(productId, files, images.length, images.some((i) => i.is_primary));
            if (result.failed.length) {
              setMessage({ kind: "error", text: `Không tải lên được: ${result.failed.join(", ")}` });
            } else {
              setMessage({ kind: "success", text: `Đã tải lên ${result.uploaded} ảnh.` });
            }
          })
        }
      />
      {busy && <p className="text-sm text-neutral-600" aria-live="polite">Đang xử lý ảnh...</p>}
      {images.length === 0 ? (
        <p className="text-sm text-neutral-600">Sản phẩm chưa có ảnh.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicImageUrl(img.storage_path)} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                {img.is_primary ? (
                  <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs text-white">Ảnh chính</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => run(() => setPrimaryImage(productId, img.id))} className="underline">Đặt làm ảnh chính</button>
                )}
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Đưa lên" className="disabled:opacity-30">↑</button>
                <button type="button" disabled={busy || i === images.length - 1} onClick={() => move(i, 1)} aria-label="Đưa xuống" className="disabled:opacity-30">↓</button>
                <button type="button" disabled={busy} onClick={() => run(() => deleteProductImage(productId, img))} className="text-red-600">Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
