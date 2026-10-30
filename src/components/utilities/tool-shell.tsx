import Link from "next/link";
import type { ReactNode } from "react";

/** Tiêu đề + đường dẫn quay lại dùng chung cho các trang tiện ích. */
export function ToolShell({
  title,
  description,
  width = "max-w-6xl",
  children,
}: {
  title: string;
  description?: string;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full ${width}`}>
      <header className="mb-6 sm:mb-8">
        <nav aria-label="Đường dẫn" className="mb-3 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/utilities/" className="font-medium transition hover:text-slate-900">
            Tiện ích
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-slate-700">{title}</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{description}</p>}
      </header>
      {children}
    </div>
  );
}
