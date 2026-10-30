remove Link importimport type { ReactNode } from "react";

/** Khung tiêu đề dùng chung cho các trang tiện ích. */
export function ToolShell({
  title,
  width = "max-w-6xl",
  children,
}: {
  title: string;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full ${width}`}>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
      </header>
      {children}
    </div>
  );
}
