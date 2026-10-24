"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@/hooks/use-query";
import { listCustomers, setBan } from "@/services/admin-order-service";
import { CustomerNameHistory } from "@/components/admin/customer-name-history";
import { CustomerGifHistory } from "@/components/admin/customer-gif-history";
import { requestPasswordReset } from "@/services/auth-service";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { FormMessage } from "@/components/ui/form";
import { adminErrorMessage } from "@/utils/errors";
import { formatDateTime } from "@/utils/labels";
import type { Customer } from "@/types";

/** "Bị ban vĩnh viễn" / "Bị khóa đến ..." or null when the member is in good standing. */
function banText(c: Customer): string | null {
  if (!c.banned_until) return null;
  const until = new Date(c.banned_until);
  if (until.getTime() <= Date.now()) return null;
  return until.getFullYear() >= 9999 ? "Bị ban vĩnh viễn" : `Bị khóa đến ${formatDateTime(c.banned_until)}`;
}

const action = "underline hover:text-black disabled:opacity-50";

export function CustomersAdmin() {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [gifHistoryCustomer, setGifHistoryCustomer] = useState<Customer | null>(null);
  const state = useQuery(`admin-customers:${version}`, listCustomers);

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      setMessage({ kind: "success", text });
      setVersion((v) => v + 1);
    } catch (err) {
      console.error(err);
      setMessage({ kind: "error", text: adminErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  function ban(c: Customer, mode: "kick" | "ban") {
    const label = mode === "kick" ? "kick (khóa 24 giờ)" : "ban (khóa vĩnh viễn)";
    const reason = window.prompt(`Lý do ${label} thành viên ${c.email} (không bắt buộc):`);
    if (reason === null) return; // cancelled
    void run(async () => {
      await setBan(c.id, mode, reason);
      return mode === "kick" ? `Đã kick ${c.email} trong 24 giờ.` : `Đã ban ${c.email}.`;
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Thành viên</h1>
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}

      {state.status === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.length === 0 && <EmptyState title="Chưa có tài khoản nào" />}
      {state.status === "success" && state.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3 font-medium">Thành viên</th>
                <th className="p-3 font-medium">Điện thoại</th>
                <th className="p-3 font-medium">Trạng thái</th>
                <th className="p-3 font-medium">Lượt tải</th>
                <th className="p-3 font-medium">Ngày tạo</th>
                <th className="p-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {state.data.map((c) => {
                const banned = banText(c);
                const isAdmin = c.role === "admin";
                return (
                  <tr key={c.id} className="align-top">
                    <td className="p-3">
                      <p className="font-medium">{c.full_name || "—"}</p>
                      <p className="text-slate-500">{c.email}</p>
                    </td>
                    <td className="p-3">{c.phone ?? "—"}</td>
                    <td className="p-3">
                      {isAdmin ? (
                        <span className="font-medium">Quản trị</span>
                      ) : banned ? (
                        <>
                          <span className="font-medium text-red-600">{banned}</span>
                          {c.ban_reason && <p className="mt-0.5 text-xs text-slate-500">Lý do: {c.ban_reason}</p>}
                        </>
                      ) : (
                        <span className="text-slate-600">Hoạt động</span>
                      )}
                    </td>
                    <td className="p-3">{c.download_count}</td>
                    <td className="whitespace-nowrap p-3">{formatDateTime(c.created_at)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <Link href={`/admin/customers/detail/?id=${c.id}`} className={action}>Lịch sử tải</Link>
                        <button type="button" className={action} onClick={() => setHistoryCustomer(c)}>Lịch sử đổi tên</button>
                        <button type="button" className={action} onClick={() => setGifHistoryCustomer(c)}>Lịch sử GIF</button>
                        {!isAdmin && (
                          <>
                            {banned ? (
                              <button type="button" disabled={busy} className={action} onClick={() => run(async () => { await setBan(c.id, "unban", ""); return `Đã gỡ khóa ${c.email}.`; })}>
                                Gỡ khóa
                              </button>
                            ) : (
                              <>
                                <button type="button" disabled={busy} className={action} onClick={() => ban(c, "kick")}>Kick 24h</button>
                                <button type="button" disabled={busy} className={`${action} text-red-600`} onClick={() => ban(c, "ban")}>Ban</button>
                              </>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              className={action}
                              onClick={() =>
                                run(async () => {
                                  await requestPasswordReset(c.email);
                                  return `Đã gửi email đặt lại mật khẩu tới ${c.email}.`;
                                })
                              }
                            >
                              Gửi email đặt lại mật khẩu
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Mật khẩu của thành viên được mã hóa và không ai xem được, kể cả quản trị viên. Khi thành viên quên mật khẩu, bấm
        “Gửi email đặt lại mật khẩu”. Kick khóa 24 giờ, Ban khóa vĩnh viễn; thành viên bị khóa không tải được tệp và bị đăng xuất.
      </p>
      {gifHistoryCustomer && (
        <CustomerGifHistory
          userId={gifHistoryCustomer.id}
          email={gifHistoryCustomer.email}
          onClose={() => setGifHistoryCustomer(null)}
        />
      )}
      {historyCustomer && (
        <CustomerNameHistory
          userId={historyCustomer.id}
          email={historyCustomer.email}
          currentName={historyCustomer.full_name}
          onClose={() => setHistoryCustomer(null)}
        />
      )}
    </div>
  );
}
