import { SIZE, frameUrl, logoUrl, type Frame } from "@/lib/add-frame-library";
import { createZip } from "@/utils/zip";

export type FitMode = "cover" | "contain";
export type LogoSide = "left" | "right" | "none";
export type ExportFormat = "jpg" | "png";

/** Cách đặt ảnh vào khung: zoom từ 1 đến 2, dịch ngang/dọc từ -1 đến 1. */
export type Adjust = { fit: FitMode; zoom: number; offsetX: number; offsetY: number };
export const DEFAULT_ADJUST: Adjust = { fit: "cover", zoom: 1, offsetX: 0, offsetY: 0 };

export type Photo = { source: CanvasImageSource; width: number; height: number };

const JPG_QUALITY = 0.95;
const PREVIEW_SOURCE_MAX = 1600;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`load_failed:${url}`));
    image.src = url;
  });
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return [canvas, ctx];
}

/** Frame/logo 3000px thu nhỏ để xem trước nhanh và nhẹ bộ nhớ; ảnh gốc được giải phóng ngay. */
const previewCache = new Map<string, Promise<HTMLCanvasElement>>();
export function loadPreviewAsset(url: string, size: number): Promise<HTMLCanvasElement> {
  const key = `${url}@${size}`;
  let cached = previewCache.get(key);
  if (!cached) {
    cached = loadImage(url).then((image) => {
      const [canvas, ctx] = makeCanvas(size);
      ctx.drawImage(image, 0, 0, size, size);
      return canvas;
    });
    cached.catch(() => previewCache.delete(key));
    previewCache.set(key, cached);
  }
  return cached;
}

/** Ảnh người dùng: bản nhỏ để xem trước. Bản đầy đủ chỉ đọc lúc xuất. */
export async function createPreviewPhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, PREVIEW_SOURCE_MAX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { source: canvas, width, height };
  } finally {
    bitmap.close();
  }
}

/** Vẽ một ảnh hoàn chỉnh: nền → ảnh → frame → logo. Dùng chung cho xem trước và xuất 3000px. */
export function compose(
  ctx: CanvasRenderingContext2D,
  size: number,
  photo: Photo | null,
  adjust: Adjust,
  frame: CanvasImageSource,
  logo: CanvasImageSource | null,
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = photo ? "#ffffff" : "#f0f0f0";
  ctx.fillRect(0, 0, size, size);

  if (photo) {
    const base = adjust.fit === "cover" ? Math.max(size / photo.width, size / photo.height) : Math.min(size / photo.width, size / photo.height);
    const scale = base * adjust.zoom;
    const width = photo.width * scale;
    const height = photo.height * scale;
    const x = (size - width) / 2 + adjust.offsetX * (Math.abs(width - size) / 2);
    const y = (size - height) / 2 + adjust.offsetY * (Math.abs(height - size) / 2);
    ctx.drawImage(photo.source, x, y, width, height);
  }

  ctx.drawImage(frame, 0, 0, size, size);
  if (logo) ctx.drawImage(logo, 0, 0, size, size);
}

function toBlob(canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))),
      format === "jpg" ? "image/jpeg" : "image/png",
      format === "jpg" ? JPG_QUALITY : undefined,
    );
  });
}

export function safeName(value: string): string {
  const cleaned = value.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "anh").slice(0, 60);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export type ExportJob = {
  file: File;
  frames: Frame[];
  adjust: Adjust;
  logo: LogoSide;
  format: ExportFormat;
  categoryName: string;
  onProgress?: (done: number, total: number) => void;
};

/**
 * Xuất ảnh 3000×3000. Một frame → tải thẳng file ảnh; nhiều frame → một file ZIP.
 * Mỗi lần chỉ giữ một canvas lớn trong bộ nhớ.
 */
export async function exportFrames(job: ExportJob): Promise<void> {
  const { file, frames, adjust, logo, format, categoryName, onProgress } = job;
  const bitmap = await createImageBitmap(file);
  const base = safeName(file.name);
  const [canvas, ctx] = makeCanvas(SIZE);
  const entries: { name: string; blob: Blob }[] = [];

  try {
    const photo: Photo = { source: bitmap, width: bitmap.width, height: bitmap.height };
    const logoImage = logo === "none" ? null : await loadImage(logoUrl(logo));
    onProgress?.(0, frames.length);

    for (const [index, frame] of frames.entries()) {
      const frameImage = await loadImage(frameUrl(frame));
      compose(ctx, SIZE, photo, adjust, frameImage, logoImage);
      const blob = await toBlob(canvas, format);
      entries.push({ name: `${base}-${safeName(frame.name)}.${format}`, blob });
      onProgress?.(index + 1, frames.length);
    }
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }

  if (entries.length === 1 && entries[0]) {
    saveBlob(entries[0].blob, entries[0].name);
    return;
  }
  saveBlob(await createZip(entries), `${base}-${safeName(categoryName)}.zip`);
}
