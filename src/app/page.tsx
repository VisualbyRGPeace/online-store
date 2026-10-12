import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Byline } from "@/components/byline";
import { HeroShowcase } from "@/components/home/hero-showcase";
import { ProductsView } from "@/components/products-view";
import { SearchBox } from "@/components/search-box";
import { ProductGridSkeleton } from "@/components/ui/states";
import { ArrowRightIcon } from "@/components/ui/icons";
import { SITE_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} | Tài nguyên để tải về` },
  description: "Tìm tài nguyên theo danh mục, đăng nhập một lần và tải trực tiếp từ Google Drive.",
};

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
              Tài nguyên
              <br />
              <span className="text-slate-400">siêu cấp bá khí</span>
            </h1>
            <p className="mt-5 max-w-md text-base text-slate-600 sm:text-lg">
              Được phát triển bởi đội ngũ top 1 thế giới Việt Nam.
            </p>
            <SearchBox base="/" anchor="tai-nguyen" className="mt-8 max-w-md" />
            <a href="#tai-nguyen" className="mt-5 inline-flex items-center gap-2 text-sm font-medium hover:underline">
              Xem tất cả tài nguyên <ArrowRightIcon className="h-4 w-4 rotate-90" />
            </a>
          </div>
          <HeroShowcase />
        </div>
      </section>

      {/* All resources + categories, right under the hero */}
      <section id="tai-nguyen" className="mt-14 scroll-mt-20">
        <Suspense fallback={<ProductGridSkeleton count={12} />}>
          <ProductsView
            base="/"
            anchor="tai-nguyen"
            showSearch={false}
            lead={<h2 className="text-xl font-semibold tracking-tight">Tất cả tài nguyên</h2>}
          />
        </Suspense>
      </section>
    </>
  );
}
