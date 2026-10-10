export const MAX_IMAGES_PER_PRODUCT = 1; // one square thumbnail per resource

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // same as the storage bucket limit
const FULL_SIZE = 900; // detail page
const SMALL_SIZE = 400; // cards in lists (4-5x lighter)
const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** Storage path of the small (400px) version that sits next to the full image. */
export function smallPath(path: string): string {
  return path.replace(/(\.[a-z0-9]+)$/i, "_s$1");
}

/** Returns an error message, or null when the file may be processed. */
export function validateImageFile(file: File): string | null {
  const name = file.name.slice(0, 60);
  if (!ALLOWED_TYPES.includes(file.type)) return `${name}: chỉ nhận ảnh JPG, PNG hoặc WebP.`;
  if (file.size > MAX_INPUT_BYTES) return `${name}: ảnh lớn hơn 15MB.`;
  if (file.size === 0) return `${name}: file rỗng.`;
  return null;
}

async function renderSquare(bitmap: ImageBitmap, sx: number, sy: number, side: number, out: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("encode_failed");
  return blob;
}

/**
 * Crops to a centred square and makes two WebP versions in the browser: 900px (detail page) and
 * 400px (cards). The original file name is never used: stored names are random UUIDs.
 */
export async function processThumbnail(file: File): Promise<{ full: Blob; small: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.round((bitmap.width - side) / 2);
    const sy = Math.round((bitmap.height - side) / 2);
    const full = await renderSquare(bitmap, sx, sy, side, Math.max(1, Math.min(side, FULL_SIZE)), 0.85);
    const small = await renderSquare(bitmap, sx, sy, side, Math.max(1, Math.min(side, SMALL_SIZE)), 0.8);
    const ext = EXT[full.type];
    if (!ext || small.type !== full.type) throw new Error("encode_failed");
    if (full.size > MAX_OUTPUT_BYTES) throw new Error("image_too_large");
    return { full, small, ext };
  } finally {
    bitmap.close();
  }
}
