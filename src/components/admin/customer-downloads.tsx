"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/hooks/use-query";
import { listCustomers } from "@/services/admin-order-service";
import { listDownloads } from "@/services/download-service";
import { DownloadsChart, TopResources } from "@/components/admin/downloads-chart";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDateTime } from "@/utils/labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CustomerDownloadsView() {
  const id = useSearchParams().get("id") ?? "";
  const valid = UUID.test(id);
  const customers = useQuery("admin-customers", listCustomers);
  const logs = useQuery(`admin-user-downloads:${id}`, () => (valid ? listDownloads(id, 1000) : Promise.resolve([])));

  if (customers.status === "loading" || logs.status === "loading") {
    return <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-busy="true" />;
  }
  if (customers.status === "error" || logs.status === "error") return <ErrorState />;

  const person = customers.data.find((c) => c.id === id);
  if (!valid || !person) {
    return <EmptyState title="Không tìm thấy thành viên" href="/admin/customers/" actionLabel="Về danh sách thành viên" />;
  }
  const rows = logs.data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/customers/" className="text-sm text-slate-500 hover:text-black">← Danh sách thành viên</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{person.full_name || person.email}</h1>
        <p className="text-sm text-slate-500">
          {person.email} · tham gia {formatDateTime(person.created_at)} · tổng {person.download_count} lượt tải
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Thành viên này chưa tải tài nguyên nào" />
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <DownloadsChart logs={rows} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Tải nhiều nhất</h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <TopResources logs={rows} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Lịch sử tải gần đây</h2>
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white text-sm">
              {rows.slice(0, 100).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span className="truncate font-medium">{l.product_name}</span>
                  <span className="shrink-0 text-slate-500">{formatDateTime(l.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
