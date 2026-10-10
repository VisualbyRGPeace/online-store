"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRightIcon } from "@/components/ui/icons";

export function HomeCta() {
  const { user, loading } = useAuth();
  const signedOut = !loading && !user;

  return (
    <section className="mt-16 rounded-3xl bg-black px-6 py-12 text-center text-white sm:px-12 sm:py-16">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Bắt đầu tải về</h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-300 sm:text-base">
        {signedOut ? "Tạo tài khoản chỉ mất vài giây, không cần xác thực email." : "Chọn tài nguyên bạn cần và tải về ngay."}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm font-medium">
        <Link href="/products/" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-black transition hover:bg-slate-200">
          Xem tài nguyên <ArrowRightIcon />
        </Link>
        {signedOut && (
          <Link href="/register/" className="rounded-xl border border-white/30 px-5 py-3 transition hover:bg-white/10">
            Tạo tài khoản
          </Link>
        )}
      </div>
    </section>
  );
}
