"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { listDonations, revokeDonation } from "@/services/admin-order-service";
import { DonationQrManager } from "@/components/admin/donation-qr-manager";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FormMessage } from "@/components/ui/form";
import { PAID_LABEL } from "@/lib/site-config";
import { adminErrorMessage } from "@/utils/errors";
import { formatVnd } from "@/utils/format";
import { formatDateTime } from "@/utils/labels";

/** Every "Xác nhận đã thanh toán" press, so the admin can compare with the bank and revoke false ones. */
export function DonationsAdmin() {
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const state = useQuery(`admin-donations:${version}`, listDonations);

  async function revoke(id: number) {
    setError(null);
    try {
      await revokeDonation(id);
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      setError(adminErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{PAID_LABEL}</h1>
        <p className="mt-1 text-sm text-slate-500">Danh sách thành viên đã bấm “Xác nhận đã thanh toán”. Đối chiếu với tài khoản nhận tiền; thu hồi nếu không đúng.</p>
      </div>
      <DonationQrManager />

      {error && <FormMessage kind="error">{error}</FormMessage>}

      {state.status === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.length === 0 && <EmptyState title="Chưa có xác nhận nào" />}
      {state.status === "success" && state.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 font-medium">Thời gian</th>
                <th className="p-3 font-medium">Thành viên</th>
                <th className="p-3 font-medium">Tài nguyên</th>
                <th className="p-3 font-medium">Số tiền</th>
                <th className="p-3 font-medium"><span className="sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {state.data.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap p-3">{formatDateTime(d.created_at)}</td>
                  <td className="p-3">
                    <Link href={`/admin/customers/detail/?id=${d.user_id}`} className="font-medium hover:underline">
                      {d.full_name || d.email}
                    </Link>
                    <p className="text-slate-500">{d.email}</p>
                  </td>
                  <td className="p-3">{d.product_name}</td>
                  <td className="whitespace-nowrap p-3">{formatVnd(d.amount)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      className="text-red-600 underline"
                      onClick={() => {
                        if (window.confirm(`Thu hồi quyền tải “${d.product_name}” của ${d.email}?`)) void revoke(d.id);
                      }}
                    >
                      Thu hồi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
