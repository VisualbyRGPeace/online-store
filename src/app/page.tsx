import Link from "next/link";
import { LatestProducts } from "@/components/latest-products";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-config";

export default function HomePage() {
  return (
    <>
      <section className="rounded-xl bg-neutral-100 px-6 py-14 text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">{SITE_NAME}</h1>
        <p className="mx-auto mt-3 max-w-xl text-neutral-600">{SITE_TAGLINE}</p>
        <Link href="/products/" className="mt-6 inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm text-white hover:bg-neutral-700">
          Xem tài nguyên
        </Link>
      </section>
      <section className="mt-12">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Mới cập nhật</h2>
          <Link href="/products/" className="text-sm text-neutral-600 hover:underline">Xem tất cả →</Link>
        </div>
        <LatestProducts />
      </section>
    </>
  );
}
