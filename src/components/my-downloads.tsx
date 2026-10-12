"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/use-query";
import { listDownloads } from "@/services/download-service";
import { ErrorState } from "@/components/ui/states";
import { formatDateTime } from "@/utils/labels";

/** "Tài nguyên đã tải": the signed-in user's own recent downloads. */
export function MyDownloads({ userId }: { userId: string }) {
  const state = useQuery(`my-downloads:${userId}`, () => listDownloads(userId, 30));

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Tài nguyên đã tải</h2>
      {state.status === "loading" && <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />}
      {state.status === "error" && <ErrorState />}
      {state.status === "success" && state.data.length === 0 && (
        <p className="text-sm text-slate-500">
          Bạn chưa tải tài nguyên nào. <Link href="/products/" className="font-medium text-black underline">Xem tài nguyên</Link>
        </p>
      )}
      {state.status === "success" && state.data.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white text-sm">
          {state.data.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 px-5 py-3">
              {l.products?.slug ? (
                <Link href={`/product/?slug=${encodeURIComponent(l.products.slug)}`} className="truncate font-medium hover:underline">
                  {l.product_name}
                </Link>
              ) : (
                <span className="truncate font-medium">{l.product_name}</span>
              )}
              <span className="shrink-0 text-slate-500">{formatDateTime(l.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
