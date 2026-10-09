"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@/hooks/use-query";
import { getGuestOrder, getOrderForOwner } from "@/services/order-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { secondaryButton } from "@/components/ui/form";
import { formatVnd } from "@/utils/format";
import { formatDateTime, orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from "@/utils/labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function OrderConfirmationView() {
  const id = useSearchParams().get("id") ?? "";
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const token = new URLSearchParams(hash.slice(1)).get("t") ?? "";
  const [copied, setCopied] = useState(false);

  const state = useQuery(`order-confirmation:${id}:${token}`, () => {
    if (!UUID.test(id)) return Promise.resolve(null);
    return token ? getGuestOrder(id, token) : getOrderForOwner(id);
  });

  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;
  const o = state.data;
  if (!o) {
    return <EmptyState title="Không tìm thấy đơn hàng" description="Liên kết không đúng hoặc bạn không có quyền xem đơn này." href="/" actionLabel="Về trang chủ" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-lg border border-green-200 bg-green-50 p-5">
        <h1 className="text-2xl font-semibold text-green-900">Đặt hàng thành công!</h1>
        <p className="mt-1 text-sm text-green-800">
          Mã đơn <strong>#{o.order_number}</strong> · {formatDateTime(o.created_at)}. Cửa hàng sẽ liên hệ xác nhận với bạn.
        </p>
      </div>

      {token && (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm">
          <p className="font-medium">Hãy lưu liên kết của trang này</p>
          <p className="mt-1 text-neutral-600">Đây là cách duy nhất để xem lại đơn nếu bạn đặt hàng không có tài khoản. Không chia sẻ liên kết cho người khác.</p>
          <button
            type="button"
            className={`${secondaryButton} mt-3`}
            onClick={() => navigator.clipboard.writeText(window.location.href).then(() => setCopied(true), () => setCopied(false))}
          >
            {copied ? "Đã sao chép" : "Sao chép liên kết"}
          </button>
        </div>
      )}

      <p className="text-sm text-neutral-600">
        Trạng thái: {orderStatusLabel[o.status] ?? o.status} · {paymentStatusLabel[o.payment_status] ?? o.payment_status}
      </p>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
        {o.items.map((i, idx) => (
          <li key={`${i.name}-${idx}`} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{i.name}</p>
              <p className="text-neutral-500">{formatVnd(i.price)} × {i.quantity}</p>
            </div>
            <p>{formatVnd(i.subtotal)}</p>
          </li>
        ))}
      </ul>

      <dl className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt>Tạm tính</dt><dd>{formatVnd(o.subtotal)}</dd></div>
        <div className="flex justify-between"><dt>Phí vận chuyển</dt><dd>{formatVnd(o.shipping_fee)}</dd></div>
        <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold"><dt>Tổng cộng</dt><dd>{formatVnd(o.total)}</dd></div>
      </dl>

      <div className="grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <h2 className="mb-1 font-medium">Giao đến</h2>
          <p>{o.customer_name} · {o.customer_phone}</p>
          <p className="text-neutral-600">{o.shipping_address}</p>
        </div>
        <div>
          <h2 className="mb-1 font-medium">Thanh toán</h2>
          <p>{paymentMethodLabel[o.payment_method] ?? o.payment_method}</p>
        </div>
      </div>

      <Link href="/products/" className="inline-block text-sm underline">Tiếp tục mua sắm</Link>
    </div>
  );
}
