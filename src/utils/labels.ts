export const orderStatusLabel: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

export const paymentStatusLabel: Record<string, string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  failed: "Thanh toán lỗi",
  refunded: "Đã hoàn tiền",
};

export const paymentMethodLabel: Record<string, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  vnpay: "VNPay",
  momo: "MoMo",
  stripe: "Thẻ (Stripe)",
};

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString("vi-VN");
