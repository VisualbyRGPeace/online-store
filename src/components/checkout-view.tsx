"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useQuery } from "@/hooks/use-query";
import { checkoutSchema, fieldErrors, formValues } from "@/lib/validation";
import { listAddresses } from "@/services/account-service";
import { placeOrder } from "@/services/order-service";
import { PAYMENT_METHODS } from "@/services/payment/methods";
import { getProductsByIds } from "@/services/product-service";
import { getShopSettings } from "@/services/settings-service";
import { Field, FormMessage, inputClass, primaryButton, TextAreaField } from "@/components/ui/form";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { orderErrorMessage } from "@/utils/errors";
import { formatVnd } from "@/utils/format";
import { computeShipping } from "@/utils/shipping";
import type { Address, ProductListItem, ShopSettings } from "@/types";

type Line = { product: ProductListItem; quantity: number };
const skeleton = <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;

export function CheckoutView() {
  const { items } = useCart();
  const auth = useAuth();
  const ids = items.map((i) => i.productId);
  const userId = auth.user?.id ?? "";

  const products = useQuery(ids.length ? `checkout-products:${[...ids].sort().join(",")}` : "checkout-empty", () =>
    ids.length ? getProductsByIds(ids) : Promise.resolve([]),
  );
  const settings = useQuery("shop-settings", getShopSettings);
  const addresses = useQuery(`checkout-addresses:${userId}`, () => (userId ? listAddresses() : Promise.resolve([])));

  if (items.length === 0) {
    return <EmptyState title="Giỏ hàng trống" description="Hãy chọn sản phẩm trước khi thanh toán." href="/products/" actionLabel="Xem sản phẩm" />;
  }
  if (auth.loading || products.status === "loading" || settings.status === "loading" || addresses.status === "loading") return skeleton;
  if (products.status === "error" || settings.status === "error" || addresses.status === "error") return <ErrorState />;

  // Re-check against fresh database data: drop unavailable items, clamp to stock.
  const byId = new Map(products.data.map((p) => [p.id, p]));
  const lines: Line[] = [];
  const notices = new Set<string>();
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p || p.stock <= 0) {
      notices.add("Một số sản phẩm đã hết hàng hoặc ngừng bán và được bỏ khỏi đơn.");
      continue;
    }
    const quantity = Math.min(item.quantity, p.stock);
    if (quantity < item.quantity) notices.add(`“${p.name}” chỉ còn ${p.stock} sản phẩm, số lượng đã được điều chỉnh.`);
    lines.push({ product: p, quantity });
  }
  if (lines.length === 0) {
    return <EmptyState title="Không có sản phẩm hợp lệ trong giỏ" href="/cart/" actionLabel="Về giỏ hàng" />;
  }

  return (
    <CheckoutForm
      lines={lines}
      notices={[...notices]}
      settings={settings.data}
      addresses={addresses.data}
      email={auth.user?.email ?? ""}
      signedIn={Boolean(auth.user)}
    />
  );
}

function CheckoutForm({
  lines,
  notices,
  settings,
  addresses,
  email,
  signedIn,
}: {
  lines: Line[];
  notices: string[];
  settings: ShopSettings;
  addresses: Address[];
  email: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const { clear } = useCart();
  const [addr, setAddr] = useState<Address | null>(addresses.find((a) => a.is_default) ?? addresses[0] ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  const shipping = computeShipping(subtotal, settings);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = checkoutSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const v = parsed.data;
    setErrors({});
    setMessage(null);
    setBusy(true);
    try {
      const placed = await placeOrder({
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        customerName: v.customer_name,
        customerPhone: v.customer_phone,
        customerEmail: v.customer_email,
        province: v.province,
        district: v.district,
        ward: v.ward,
        street: v.street,
        note: v.note,
        paymentMethod: v.payment_method,
      });
      // The token is a secret that lets a guest view this order; keep it in the URL fragment
      // (#t=...) so it is never sent to any server.
      router.push(`/order/?id=${placed.out_order_id}#t=${placed.out_lookup_token}`);
      clear();
    } catch (err) {
      console.error(err);
      setMessage(orderErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Thanh toán</h1>
      {notices.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          {notices.map((n) => <p key={n}>{n}</p>)}
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-3">
        <form onSubmit={onSubmit} noValidate className="space-y-6 lg:col-span-2">
          {message && <FormMessage kind="error">{message}</FormMessage>}

          {!signedIn && (
            <p className="text-sm text-neutral-600">
              Bạn có thể đặt hàng không cần tài khoản. Đã có tài khoản?{" "}
              <Link href="/login/" className="underline">Đăng nhập</Link> để dùng địa chỉ đã lưu.
            </p>
          )}
          {addresses.length > 0 && (
            <div>
              <label htmlFor="saved-address" className="mb-1 block text-sm font-medium">Địa chỉ đã lưu</label>
              <select
                id="saved-address"
                className={inputClass}
                value={addr?.id ?? ""}
                onChange={(e) => setAddr(addresses.find((a) => a.id === e.target.value) ?? null)}
              >
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>{a.recipient_name} · {[a.street, a.district, a.province].join(", ")}</option>
                ))}
                <option value="">Nhập địa chỉ mới</option>
              </select>
            </div>
          )}

          <fieldset key={addr?.id ?? "new"} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-lg font-semibold">Thông tin giao hàng</legend>
            <Field label="Họ và tên người nhận" name="customer_name" defaultValue={addr?.recipient_name ?? ""} maxLength={100} autoComplete="name" error={errors.customer_name} />
            <Field label="Số điện thoại" name="customer_phone" type="tel" defaultValue={addr?.phone ?? ""} autoComplete="tel" error={errors.customer_phone} />
            <div className="sm:col-span-2">
              <Field label="Email (không bắt buộc)" name="customer_email" type="email" defaultValue={email} autoComplete="email" error={errors.customer_email} />
            </div>
            <Field label="Tỉnh / Thành phố" name="province" defaultValue={addr?.province ?? ""} maxLength={100} error={errors.province} />
            <Field label="Quận / Huyện" name="district" defaultValue={addr?.district ?? ""} maxLength={100} error={errors.district} />
            <Field label="Phường / Xã" name="ward" defaultValue={addr?.ward ?? ""} maxLength={100} error={errors.ward} />
            <Field label="Địa chỉ cụ thể (số nhà, đường)" name="street" defaultValue={addr?.street ?? ""} maxLength={200} error={errors.street} />
            <div className="sm:col-span-2">
              <TextAreaField label="Ghi chú (không bắt buộc)" name="note" rows={3} maxLength={500} error={errors.note} />
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-lg font-semibold">Phương thức thanh toán</legend>
            {PAYMENT_METHODS.map((m) => (
              <label key={m.id} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${m.enabled ? "border-neutral-300" : "border-neutral-200 opacity-50"}`}>
                <input type="radio" name="payment_method" value={m.id} defaultChecked={m.id === "cod"} disabled={!m.enabled} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="text-neutral-600">{m.description}</span>
                </span>
              </label>
            ))}
            {errors.payment_method && <p className="text-xs text-red-600">{errors.payment_method}</p>}
          </fieldset>

          <button type="submit" disabled={busy} className={`${primaryButton} w-full sm:w-auto`}>
            {busy ? "Đang đặt hàng..." : "Đặt hàng"}
          </button>
        </form>

        <aside className="h-fit rounded-lg border border-neutral-200 p-5 text-sm">
          <h2 className="mb-3 font-semibold">Đơn hàng của bạn</h2>
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.product.id} className="flex justify-between gap-3">
                <span className="min-w-0">{l.product.name} × {l.quantity}</span>
                <span className="shrink-0">{formatVnd(l.product.price * l.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-neutral-200 pt-3">
            <div className="flex justify-between"><dt>Tạm tính</dt><dd>{formatVnd(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Phí vận chuyển</dt><dd>{shipping === 0 ? "Miễn phí" : formatVnd(shipping)}</dd></div>
            <div className="flex justify-between pt-2 text-base font-semibold"><dt>Tổng cộng</dt><dd>{formatVnd(subtotal + shipping)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">Giá và tồn kho được hệ thống kiểm tra lại khi đặt hàng; tổng cuối cùng theo xác nhận của hệ thống.</p>
        </aside>
      </div>
    </div>
  );
}
