"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { getOrder } from "@/services/account-service";
import { listAdminOrders, markCodPaid, setOrderStatus } from "@/services/admin-order-service";
import { Pager } from "@/components/admin/products-admin";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FormMessage, primaryButton, secondaryButton } from "@/components/ui/form";
import { adminErrorMessage } from "@/utils/errors";
import { formatVnd } from "@/utils/format";
import { formatDateTime, orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from "@/utils/labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTERS = ["", "pending", "confirmed", "shipping", "completed", "cancelled"] as const;
const NEXT_STATUS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipping", "cancelled"],
  shipping: ["completed"],
};

export function OrdersAdmin() {
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const state = useQuery(`admin-orders:${status}:${page}`, () => listAdminOrders(page, status || undefined));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Đơn hàng</h1>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || "all"}
            type="button"
            onClick={() => { setStatus(f); setPage(1); }}
            className={`rounded-full border px-3 py-1 text-sm ${status === f ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}
          >
            {f ? orderStatusLabel[f] : "Tất cả"}
          </button>
        ))}
      </div>

      {state.status === "loading" && <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.items.length === 0 && <EmptyState title="Không có đơn hàng" />}
      {state.status === "success" && state.data.items.length > 0 && (
        <>
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 text-sm">
            {state.data.items.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/detail/?id=${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-neutral-50">
                  <div>
                    <p className="font-medium">Đơn #{o.order_number} · {o.customer_name}</p>
                    <p className="text-neutral-500">{formatDateTime(o.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatVnd(o.total)}</p>
                    <p className="text-neutral-600">{orderStatusLabel[o.status] ?? o.status} · {paymentStatusLabel[o.payment_status] ?? o.payment_status}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager page={page} total={state.data.total} pageSize={state.data.pageSize} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export function OrderDetailAdmin() {
  const id = useSearchParams().get("id") ?? "";
  const valid = UUID.test(id);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const state = useQuery(`admin-order:${id}:${version}`, () => (valid ? getOrder(id) : Promise.resolve(null)));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      setError(adminErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (state.status === "error") return <ErrorState />;
  const o = state.data;
  if (!o) return <EmptyState title="Không tìm thấy đơn hàng" href="/admin/orders/" actionLabel="Về danh sách đơn hàng" />;

  const nextStatuses = NEXT_STATUS[o.status] ?? [];
  const canMarkPaid = o.payment_method === "cod" && o.payment_status === "unpaid" && (o.status === "shipping" || o.status === "completed");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders/" className="text-sm text-neutral-600 hover:underline">← Danh sách đơn hàng</Link>
        <h1 className="mt-1 text-2xl font-semibold">Đơn #{o.order_number}</h1>
        <p className="text-sm text-neutral-600">{formatDateTime(o.created_at)} · {orderStatusLabel[o.status] ?? o.status} · {paymentStatusLabel[o.payment_status] ?? o.payment_status}</p>
      </div>

      {error && <FormMessage kind="error">{error}</FormMessage>}
      {(nextStatuses.length > 0 || canMarkPaid) && (
        <div className="flex flex-wrap gap-3">
          {nextStatuses.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              className={s === "cancelled" ? secondaryButton : primaryButton}
              onClick={() => {
                if (s === "cancelled" && !window.confirm("Hủy đơn này? Tồn kho sẽ được trả lại.")) return;
                void run(() => setOrderStatus(o.id, s));
              }}
            >
              {s === "cancelled" ? "Hủy đơn" : `Chuyển sang: ${orderStatusLabel[s]}`}
            </button>
          ))}
          {canMarkPaid && (
            <button type="button" disabled={busy} className={secondaryButton} onClick={() => run(() => markCodPaid(o.id))}>
              Đã thu tiền (COD)
            </button>
          )}
        </div>
      )}

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
          <h2 className="mb-1 font-medium">Khách hàng / giao đến</h2>
          <p>{o.customer_name} · {o.customer_phone}</p>
          <p className="text-neutral-600">{[o.shipping_street, o.shipping_ward, o.shipping_district, o.shipping_province].join(", ")}</p>
          {o.note && <p className="mt-1 text-neutral-600">Ghi chú: {o.note}</p>}
        </div>
        <div>
          <h2 className="mb-1 font-medium">Thanh toán</h2>
          <p>{paymentMethodLabel[o.payment_method] ?? o.payment_method}</p>
        </div>
      </div>
    </div>
  );
}
