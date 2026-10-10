"use client";

import Link from "next/link";

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="aspect-square bg-slate-200" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-100" />
            <div className="h-3 w-2/3 rounded bg-slate-100" />
            <div className="mt-4 h-10 rounded-xl bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  href,
  actionLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
      {href && actionLabel && (
        <Link href={href} className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message = "Không tải được dữ liệu. Vui lòng thử lại." }: { message?: string }) {
  return (
    <div role="alert" className="rounded-3xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <p className="text-sm text-red-800">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
      >
        Thử lại
      </button>
    </div>
  );
}
