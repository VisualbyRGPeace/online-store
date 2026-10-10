"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { DownloadIcon } from "@/components/ui/icons";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-config";

export function LogoMark() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-sm">
      <DownloadIcon className="h-4 w-4" />
    </span>
  );
}

const navLink = "rounded-lg px-3 py-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";

export function Header() {
  const { user, loading } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <LogoMark />
          <span className="text-[17px]">{SITE_NAME}</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          <Link href="/products/" className={navLink}>
            Tài nguyên
          </Link>
          {!loading &&
            (user ? (
              <Link href="/account/" className="rounded-lg bg-slate-900 px-3.5 py-2 text-white transition hover:bg-slate-700">
                Tài khoản
              </Link>
            ) : (
              <>
                <Link href="/login/" className={navLink}>
                  Đăng nhập
                </Link>
                <Link href="/register/" className="hidden rounded-lg bg-brand-600 px-3.5 py-2 text-white shadow-sm transition hover:bg-brand-700 sm:inline-flex">
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
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <div>
            <p className="font-semibold text-slate-800">{SITE_NAME}</p>
            <p className="text-xs">{SITE_TAGLINE}</p>
          </div>
        </div>
        <nav className="flex gap-5">
          <Link href="/products/" className="hover:text-slate-900">Tài nguyên</Link>
          <Link href="/login/" className="hover:text-slate-900">Đăng nhập</Link>
        </nav>
        <p className="text-xs">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
