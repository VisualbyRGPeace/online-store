/**
 * Nén ảnh minh họa xuống mức nhỏ nhất có thể: cắt vuông giữa ảnh, thu còn tối đa 64px, WebP chất lượng thấp
 * (thường chỉ 1–3 KB) rồi lưu thẳng trong cơ sở dữ liệu. Ảnh gốc không bao giờ được lưu lại.
 */
const ATTEMPTS: [side: number, quality: number][] = [
  [64, 0.6],
  [64, 0.45],
  [56, 0.4],
  [48, 0.35],
  [40, 0.3],
];
const TARGET_LENGTH = 3_000; // ký tự base64, khoảng 2,2 KB

export async function createTinyThumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const crop = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - crop) / 2;
    const sy = (bitmap.height - crop) / 2;
    let result = "";
    for (const [side, quality] of ATTEMPTS) {
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Trình duyệt không xử lý được ảnh.");
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, side, side);
      ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, side, side);
      result = canvas.toDataURL("image/webp", quality);
      if (!result.startsWith("data:image/webp")) result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= TARGET_LENGTH) break;
    }
    return result;
  } finally {
    bitmap.close();
  }
}
