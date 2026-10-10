export const MAX_IMAGES_PER_PRODUCT = 1; // one square thumbnail per resource

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // same as the storage bucket limit
const MAX_DIMENSION = 900;
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
 * Crops the image to a centred square, shrinks it to at most 900px and re-encodes it as WebP in the
 * browser. The original file name is never used: the stored name is a random UUID.
 */
export async function processImage(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) / 2);
  const sy = Math.round((bitmap.height - side) / 2);
  const out = Math.max(1, Math.min(side, MAX_DIMENSION));

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  const ext = blob ? EXT[blob.type] : undefined;
  if (!blob || !ext) throw new Error("encode_failed");
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error("image_too_large");
  return { blob, ext };
}
