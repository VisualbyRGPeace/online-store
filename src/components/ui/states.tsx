"use client";

import Link from "next/link";

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square rounded-lg bg-neutral-200" />
          <div className="mt-3 h-4 w-3/4 rounded bg-neutral-200" />
          <div className="mt-2 h-4 w-1/3 rounded bg-neutral-200" />
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
    <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-16 text-center">
      <p className="text-lg font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-neutral-600">{description}</p>}
      {href && actionLabel && (
        <Link href={href} className="mt-5 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function ErrorState({ message = "Không tải được dữ liệu. Vui lòng thử lại." }: { message?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center">
      <p className="text-sm text-red-800">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-800 hover:bg-red-100"
      >
        Thử lại
      </button>
    </div>
  );
}
