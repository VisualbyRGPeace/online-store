/** Nén ảnh minh họa thành ảnh siêu nhỏ (khoảng vài KB) để lưu thẳng trong cơ sở dữ liệu. */
const ATTEMPTS: [side: number, quality: number][] = [
  [128, 0.72],
  [128, 0.55],
  [96, 0.5],
  [80, 0.4],
];
const TARGET_LENGTH = 14_000;

export async function createTinyThumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    let result = "";
    for (const [side, quality] of ATTEMPTS) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không xử lý được ảnh.");
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      result = canvas.toDataURL("image/webp", quality);
      if (!result.startsWith("data:image/webp")) result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= TARGET_LENGTH) break;
    }
    return result;
  } finally {
    bitmap.close();
  }
}
