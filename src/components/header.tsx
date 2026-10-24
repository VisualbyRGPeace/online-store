"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Byline } from "@/components/byline";
import { DownloadIcon } from "@/components/ui/icons";
import { SITE_NAME } from "@/lib/site-config";

export function LogoMark() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-black text-white">
      <DownloadIcon className="h-4 w-4" />
    </span>
  );
}

export function Header() {
  const { user, loading } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label="Trang chủ" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[17px] font-semibold tracking-tight">{SITE_NAME}</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm font-medium">
          <Link href="/products/" className="rounded-lg px-3.5 py-2 text-slate-700 transition hover:bg-slate-100">
            Tài nguyên
          </Link>
          {!loading &&
            (user ? (
              <Link href="/account/" className="rounded-lg bg-black px-3.5 py-2 text-white transition hover:bg-slate-700">
                Tài khoản
              </Link>
            ) : (
              <>
                <Link href="/login/" className="rounded-lg px-3.5 py-2 text-slate-700 transition hover:bg-slate-100">
                  Đăng nhập
                </Link>
                <Link href="/register/" className="hidden rounded-lg bg-black px-3.5 py-2 text-white transition hover:bg-slate-700 sm:inline-flex">
                  Đăng ký
                </Link>
              </>
            ))}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 py-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
        <Byline />
        <Link href="/products/" className="text-sm text-slate-500 hover:text-black">
          Tài nguyên
        </Link>
      </div>
    </footer>
  );
}
