import type { Metadata } from "next";
import Link from "next/link";
import { Byline } from "@/components/byline";
import { HeroShowcase } from "@/components/home/hero-showcase";
import { HomeCategories } from "@/components/home/home-categories";
import { HomeCta } from "@/components/home/home-cta";
import { SearchBox } from "@/components/search-box";
import { ArrowRightIcon, DownloadIcon, LockIcon, SearchIcon } from "@/components/ui/icons";
import { FREE_LABEL, SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} | Tài nguyên để tải về` },
  description: "Tìm tài nguyên theo danh mục, đăng nhập một lần và tải trực tiếp từ Google Drive.",
};

const steps = [
  { Icon: SearchIcon, title: "Chọn tài nguyên", text: "Tìm theo tên hoặc duyệt theo danh mục." },
  { Icon: LockIcon, title: "Đăng nhập", text: "Tạo tài khoản trong vài giây, không cần xác thực email." },
  { Icon: DownloadIcon, title: "Tải về", text: "Nhận liên kết và tải trực tiếp từ Google Drive." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid items-center gap-12 px-6 py-14 sm:px-12 sm:py-20 lg:grid-cols-2">
          <div>
            <Byline />
            <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
              Tìm đúng tài nguyên.
              <br />
              <span className="text-slate-400">Tải về ngay.</span>
            </h1>
            <p className="mt-5 max-w-md text-base text-slate-600 sm:text-lg">
              Duyệt theo danh mục, tìm theo tên, đăng nhập một lần để tải trực tiếp từ Google Drive.
            </p>
            <SearchBox base="/products/" className="mt-8 max-w-md" />
            <Link href="/products/" className="mt-5 inline-flex items-center gap-2 text-sm font-medium hover:underline">
              Xem tất cả tài nguyên <ArrowRightIcon />
            </Link>
          </div>
          <HeroShowcase />
        </div>
      </section>

      <HomeCategories />

      {/* How it works */}
      <section className="mt-14">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Cách hoạt động</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map(({ Icon, title, text }, i) => (
            <li key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-black text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-slate-300">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Two kinds of resources */}
      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black ring-1 ring-black/10">{FREE_LABEL}</span>
          <h3 className="mt-4 text-lg font-semibold">Tải về không mất phí</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">Đăng nhập là tải được.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <span className="inline-flex items-center rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white">Trả phí</span>
          <h3 className="mt-4 text-lg font-semibold">Mua để tải</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">Sắp mở bán.</p>
        </div>
      </section>

      <HomeCta />
    </>
  );
}
