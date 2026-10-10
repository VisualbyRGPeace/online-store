"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_IMAGES_PER_PRODUCT, validateImageFile } from "@/utils/image";
import { adminErrorMessage } from "@/utils/errors";
import { useQuery } from "@/hooks/use-query";
import { deleteProductImage, ensurePrimaryImage, listProductImages, uploadProductImages } from "@/services/admin-catalog-service";
import { publicImageUrl } from "@/services/product-service";
import { FormMessage, secondaryButton } from "@/components/ui/form";
import { ErrorState } from "@/components/ui/states";

/** Drag & drop / click-to-pick area. Validates type and size and caps the number of images. */
export function ImageDropzone({
  remaining,
  disabled,
  label = "Kéo thả ảnh vào đây hoặc",
  onFiles,
}: {
  remaining: number;
  disabled?: boolean;
  label?: string;
  onFiles: (files: File[]) => void;
}) {
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
      else if (valid.length >= remaining) problems.push(`Chỉ chọn tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh.`);
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
        <p>{label}</p>
        <button type="button" disabled={disabled || remaining <= 0} onClick={() => inputRef.current?.click()} className={`${secondaryButton} mt-2`}>
          Chọn ảnh
        </button>
        <p className="mt-2 text-xs text-neutral-500">JPG, PNG hoặc WebP · ảnh được tự cắt vuông ở giữa</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
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

/** New resource: the thumbnail is chosen first and uploaded right after the resource is saved. */
export function PendingImages({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const file = files[0];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Ảnh thumbnail (hình vuông)</p>
      {file ? (
        <div className="relative w-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[0]} alt="" className="aspect-square w-full rounded object-cover" />
          <button type="button" aria-label="Bỏ ảnh" onClick={() => onChange([])} className="absolute right-1 top-1 rounded bg-white/90 px-1.5 text-sm shadow">
            ×
          </button>
        </div>
      ) : (
        <ImageDropzone remaining={MAX_IMAGES_PER_PRODUCT} onFiles={(added) => onChange(added.slice(0, MAX_IMAGES_PER_PRODUCT))} />
      )}
    </div>
  );
}

/** Edit resource: shows the current thumbnail; choosing a new image replaces it. */
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
    } catch (err) {
      console.error(err);
      setMessage({ kind: "error", text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
      setVersion((v) => v + 1);
    }
  }

  if (state.status === "loading") return <div className="h-32 animate-pulse rounded-lg bg-neutral-200" />;
  if (state.status === "error") return <ErrorState />;
  const images = state.data;
  const current = images[0];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Ảnh thumbnail</h2>
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      {current && (
        <div className="w-40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicImageUrl(current.storage_path)} alt="" className="aspect-square w-full rounded object-cover" />
          <button type="button" disabled={busy} onClick={() => run(() => deleteProductImage(productId, current))} className="mt-2 text-sm text-red-600 underline">
            Xóa ảnh
          </button>
        </div>
      )}
      <ImageDropzone
        remaining={MAX_IMAGES_PER_PRODUCT}
        disabled={busy}
        label={current ? "Chọn ảnh mới để thay thế" : "Kéo thả ảnh vào đây hoặc"}
        onFiles={(files) =>
          run(async () => {
            // keep the old thumbnail until the new one is safely uploaded
            const result = await uploadProductImages(productId, files.slice(0, MAX_IMAGES_PER_PRODUCT), images.length, images.length > 0);
            if (result.failed.length > 0) {
              setMessage({ kind: "error", text: "Không tải ảnh lên được. Hãy thử ảnh khác." });
              return;
            }
            for (const old of images) await deleteProductImage(productId, old);
            await ensurePrimaryImage(productId);
            setMessage({ kind: "success", text: "Đã cập nhật ảnh thumbnail." });
          })
        }
      />
      {busy && <p className="text-sm text-neutral-600" aria-live="polite">Đang xử lý ảnh...</p>}
    </div>
  );
}
