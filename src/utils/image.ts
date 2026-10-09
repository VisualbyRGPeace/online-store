export const MAX_IMAGES_PER_PRODUCT = 10;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // same as the storage bucket limit
const MAX_DIMENSION = 1600;
const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** Returns an error message, or null when the file may be processed. */
export function validateImageFile(file: File): string | null {
  const name = file.name.slice(0, 60);
  if (!ALLOWED_TYPES.includes(file.type)) return `${name}: chỉ nhận ảnh JPG, PNG hoặc WebP.`;
  if (file.size > MAX_INPUT_BYTES) return `${name}: ảnh lớn hơn 15MB.`;
  if (file.size === 0) return `${name}: file rỗng.`;
  return null;
}

/**
 * Re-encodes the image in the browser (max 1600px, WebP). The original file name is never used:
 * the stored name is a random UUID, so there are no collisions and no unsafe characters.
 */
export async function processImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  const ext = blob ? EXT[blob.type] : undefined;
  if (!blob || !ext) throw new Error("encode_failed");
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error("image_too_large");
  return { blob, ext };
}
