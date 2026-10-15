"use client";

import { useQuery } from "@/hooks/use-query";
import { listBankTransfers } from "@/services/payment-service";
import { ErrorState } from "@/components/ui/states";
import { formatVnd } from "@/utils/format";
import { formatDateTime } from "@/utils/labels";

const resultLabel: Record<string, string> = {
  paid: "Đã khớp và mở khóa",
  no_code: "Không có mã thanh toán",
  no_match: "Mã không khớp",
  amount_too_low: "Thiếu tiền",
  already_paid: "Đã thanh toán trước đó",
};

/** What the bank webhook reported recently: use it to see why a payment did not unlock a file. */
export function BankTransfersPanel() {
  const state = useQuery("admin-bank-transfers", listBankTransfers);
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Giao dịch ngân hàng nhận được</h2>
      <p className="mb-3 text-sm text-slate-500">30 giao dịch gần nhất SePay báo về. Chỉ có dữ liệu khi bạn đã bật chế độ Tự động.</p>
      {state.status === "loading" && <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.length === 0 && <p className="text-sm text-slate-500">Chưa có giao dịch nào.</p>}
      {state.status === "success" && state.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 font-medium">Thời gian</th>
                <th className="p-3 font-medium">Số tiền</th>
                <th className="p-3 font-medium">Nội dung</th>
                <th className="p-3 font-medium">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {state.data.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap p-3">{formatDateTime(t.created_at)}</td>
                  <td className="whitespace-nowrap p-3">{formatVnd(t.amount)}</td>
                  <td className="max-w-xs truncate p-3 text-slate-600">{t.content ?? "—"}</td>
                  <td className={`p-3 ${t.result === "paid" ? "font-medium" : "text-slate-500"}`}>{resultLabel[t.result] ?? t.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
