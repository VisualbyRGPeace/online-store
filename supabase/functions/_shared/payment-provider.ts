// Server-side payment abstraction (runs in Supabase Edge Functions / Deno, never in the browser).
//
// RULES for every provider:
//  1. Only a verified webhook (signature checked against the provider's secret) may mark an
//     order as paid, using the service role. The browser's "success" redirect is never trusted.
//  2. The amount comes from the database (orders.total), never from the request.
//  3. payments.provider_ref is unique, so a replayed webhook cannot be applied twice.
// Adding VNPay / MoMo / Stripe = implement this interface + register it below. Orders, cart and
// checkout code do not change.

export type PaymentProviderId = "cod" | "vnpay" | "momo" | "stripe";

export interface PaymentOrder {
  orderId: string;
  amount: number; // integer VND, read from orders.total
  currency: "VND";
  description: string;
  returnUrl: string;
}

export interface CreatePaymentResult {
  providerRef: string | null;
  redirectUrl: string | null; // where to send the customer (null for COD)
  status: "pending" | "succeeded";
}

export interface VerifyPaymentResult {
  status: "succeeded" | "failed" | "pending";
  providerRef: string;
  amount: number;
}

export interface WebhookResult {
  orderId: string;
  providerRef: string;
  amount: number;
  status: "succeeded" | "failed";
  rawPayload: unknown;
}

export interface RefundResult {
  refunded: boolean;
  providerRef: string | null;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  createPayment(order: PaymentOrder): Promise<CreatePaymentResult>;
  verifyPayment(providerRef: string): Promise<VerifyPaymentResult>;
  /** Must verify the provider's signature and throw if it is invalid. */
  handleWebhook(request: Request): Promise<WebhookResult>;
  refundPayment(providerRef: string, amount: number): Promise<RefundResult>;
}

/** Cash on delivery: nothing to create online; an admin marks it paid via admin_mark_cod_paid(). */
export class CodProvider implements PaymentProvider {
  readonly id = "cod" as const;

  createPayment(): Promise<CreatePaymentResult> {
    return Promise.resolve({ providerRef: null, redirectUrl: null, status: "pending" });
  }
  verifyPayment(): Promise<VerifyPaymentResult> {
    return Promise.reject(new Error("cod_has_no_online_verification"));
  }
  handleWebhook(): Promise<WebhookResult> {
    return Promise.reject(new Error("cod_has_no_webhook"));
  }
  refundPayment(): Promise<RefundResult> {
    return Promise.reject(new Error("cod_refunds_are_manual"));
  }
}

const providers: Partial<Record<PaymentProviderId, PaymentProvider>> = {
  cod: new CodProvider(),
  // vnpay: new VnpayProvider(),
  // momo: new MomoProvider(),
  // stripe: new StripeProvider(),
};

export function getProvider(id: string): PaymentProvider {
  const provider = providers[id as PaymentProviderId];
  if (!provider) throw new Error(`payment_provider_unavailable:${id}`);
  return provider;
}
