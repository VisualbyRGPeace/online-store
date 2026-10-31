// Bỏ các ký tự dễ nhầm (0/o, 1/l/i) để tên đọc và gõ lại không bị sai.
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Tên file xuất ra của các tiện ích (QR, Video → GIF): ngắn gọn, luôn bắt đầu bằng "rgpeace",
 * kèm 4 ký tự ngẫu nhiên để các lần tải khác nhau không trùng tên. Ví dụ: "rgpeace-k3f9.gif".
 * Add frame không dùng hàm này vì tên file ở đó do người dùng tự đặt.
 */
export function exportFileName(extension: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const code = Array.from(bytes, (byte) => CODE_CHARS[byte % CODE_CHARS.length]).join("");
  return `rgpeace-${code}.${extension}`;
}
