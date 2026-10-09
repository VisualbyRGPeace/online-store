/** Maps database/storage errors to friendly Vietnamese text. Raw errors are never shown. */
export function adminErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const msg = e?.message ?? "";
  if (e?.code === "23505") return "Giá trị bị trùng (ví dụ slug đã tồn tại). Hãy đổi và thử lại.";
  if (e?.code === "23503") return "Không thể thực hiện vì dữ liệu đang được dùng ở nơi khác.";
  if (msg.includes("invalid_transition")) return "Không thể chuyển sang trạng thái này.";
  if (msg.includes("refund_required")) return "Đơn đã thanh toán, cần hoàn tiền trước khi hủy.";
  if (msg.includes("forbidden") || e?.code === "42501") return "Bạn không có quyền thực hiện thao tác này.";
  return "Thao tác không thành công, vui lòng thử lại.";
}
