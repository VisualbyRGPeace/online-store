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

/** Errors raised by place_order() and the order rate-limit trigger. */
export function orderErrorMessage(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? "";
  if (msg.includes("insufficient_stock")) return "Một số sản phẩm không còn đủ hàng. Vui lòng quay lại giỏ hàng và kiểm tra lại.";
  if (msg.includes("product_unavailable")) return "Một số sản phẩm không còn được bán. Vui lòng quay lại giỏ hàng.";
  if (msg.includes("too_many_orders")) return "Bạn đã đặt quá nhiều đơn trong thời gian ngắn. Vui lòng thử lại sau.";
  if (msg.includes("invalid_phone")) return "Số điện thoại không hợp lệ.";
  if (msg.includes("invalid_email")) return "Email không hợp lệ.";
  if (msg.includes("invalid_name") || msg.includes("invalid_address") || msg.includes("invalid_note")) {
    return "Thông tin giao hàng chưa hợp lệ, vui lòng kiểm tra lại.";
  }
  if (msg.includes("invalid_items") || msg.includes("unsupported_payment_method")) {
    return "Đơn hàng không hợp lệ, vui lòng kiểm tra lại giỏ hàng.";
  }
  return "Không đặt được hàng, vui lòng thử lại sau.";
}
