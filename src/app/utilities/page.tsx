import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Tiện ích" };

const tools = [
  { href: "/utilities/qr/", name: "Tạo mã QR", description: "Tạo và tải mã QR dạng SVG." },
  { href: "/utilities/prompts/", name: "Thư viện prompt", description: "Lưu mẫu, thay nhanh biến và sao chép prompt." },
];

export default function UtilitiesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7">
        <p className="mb-2 text-sm font-medium text-slate-500">Công cụ hữu ích</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Tiện ích</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link key={tool.href} href={tool.href} className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md">
            <div className="mb-8 grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
              {tool.name === "Tạo mã QR" ? "QR" : "Aa"}
            </div>
            <h2 className="font-semibold text-slate-950">{tool.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{tool.description}</p>
            <span className="mt-5 inline-flex text-sm font-medium text-slate-800">Mở tiện ích <span className="ml-2 transition group-hover:translate-x-1">→</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
