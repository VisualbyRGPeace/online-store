import Link from "next/link";
import { LatestProducts } from "@/components/latest-products";
import { SearchBox } from "@/components/search-box";
import { ArrowRightIcon } from "@/components/ui/icons";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-config";

export default function HomePage() {
  return (
    <>
      <section className="hero-bg rounded-3xl border border-slate-200 px-6 py-14 text-center sm:py-20">
        <p className="mx-auto inline-flex items-center rounded-full border border-brand-200 bg-white px-3.5 py-1 text-xs font-medium text-brand-700 shadow-sm">
          Miễn phí &amp; trả phí · Tải trực tiếp qua Google Drive
        </p>
        <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="bg-linear-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">{SITE_NAME}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-600 sm:text-lg">{SITE_TAGLINE}</p>
        <SearchBox className="mx-auto mt-8 max-w-xl" />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm font-medium">
          <Link href="/products/" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-white shadow-sm hover:bg-slate-700">
            Xem tất cả <ArrowRightIcon />
          </Link>
          <Link href="/products/?type=free" className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-slate-700 shadow-sm hover:bg-slate-50">
            Chỉ miễn phí
          </Link>
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Mới cập nhật</h2>
          <Link href="/products/" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            Xem tất cả <ArrowRightIcon />
          </Link>
        </div>
        <LatestProducts />
      </section>
    </>
  );
}
