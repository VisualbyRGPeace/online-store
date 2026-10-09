// What the checkout UI offers. The real work for each method lives server-side
// (supabase/functions/_shared/payment-provider.ts). Enable a method here only after its
// provider + webhook are deployed.
export type PaymentMethodId = "cod" | "vnpay" | "momo" | "stripe";

export type PaymentMethodInfo = { id: PaymentMethodId; label: string; description: string; enabled: boolean };

export const PAYMENT_METHODS: PaymentMethodInfo[] = [
  { id: "cod", label: "Thanh toán khi nhận hàng (COD)", description: "Trả tiền mặt khi nhận được hàng.", enabled: true },
  { id: "vnpay", label: "VNPay", description: "Sắp ra mắt", enabled: false },
  { id: "momo", label: "MoMo", description: "Sắp ra mắt", enabled: false },
  { id: "stripe", label: "Thẻ quốc tế (Stripe)", description: "Sắp ra mắt", enabled: false },
];
