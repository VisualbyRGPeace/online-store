"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { useQuery } from "@/hooks/use-query";
import { getOrder, listOrders } from "@/services/account-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatVnd } from "@/utils/format";
import { formatDateTime, orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from "@/utils/labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function OrdersListView() {
  return <AuthGate>{(userId) => <OrdersList userId={userId} />}</AuthGate>;
}

function OrdersList({ userId }: { userId: string }) {
  const state = useQuery(`orders:${userId}`, listOrders);
  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;
  if (state.data.length === 0) {
    return <EmptyState title="Bạn chưa có đơn hàng" href="/products/" actionLabel="Mua sắm ngay" />;
  }
  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
      {state.data.map((o) => (
        <li key={o.id}>
          <Link href={`/account/orders/detail/?id=${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-neutral-50">
            <div>
              <p className="font-medium">Đơn #{o.order_number}</p>
              <p className="text-neutral-500">{formatDateTime(o.created_at)}</p>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatVnd(o.total)}</p>
              <p className="text-neutral-600">
                {orderStatusLabel[o.status] ?? o.status} · {paymentStatusLabel[o.payment_status] ?? o.payment_status}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function OrderDetailView() {
  return <AuthGate>{(userId) => <OrderDetailContent userId={userId} />}</AuthGate>;
}

function OrderDetailContent({ userId }: { userId: string }) {
  const id = useSearchParams().get("id") ?? "";
  const valid = UUID.test(id);
  const state = useQuery(`order:${userId}:${id}`, () => (valid ? getOrder(id) : Promise.resolve(null)));

  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;
  const o = state.data;
  if (!o) {
    return <EmptyState title="Không tìm thấy đơn hàng" href="/account/orders/" actionLabel="Về danh sách đơn hàng" />;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Đơn #{o.order_number}</h1>
        <p className="text-sm text-neutral-600">
          {formatDateTime(o.created_at)} · {orderStatusLabel[o.status] ?? o.status} · {paymentStatusLabel[o.payment_status] ?? o.payment_status}
        </p>
      </div>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
        {o.order_items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{i.product_name_snapshot}</p>
              <p className="text-neutral-500">{formatVnd(i.price_snapshot)} × {i.quantity}</p>
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
          <p className="text-neutral-600">{[o.shipping_street, o.shipping_ward, o.shipping_district, o.shipping_province].join(", ")}</p>
          {o.note && <p className="mt-1 text-neutral-600">Ghi chú: {o.note}</p>}
        </div>
        <div>
          <h2 className="mb-1 font-medium">Thanh toán</h2>
          <p>{paymentMethodLabel[o.payment_method] ?? o.payment_method}</p>
        </div>
      </div>

      <Link href="/account/orders/" className="inline-block text-sm underline">← Danh sách đơn hàng</Link>
    </div>
  );
}
