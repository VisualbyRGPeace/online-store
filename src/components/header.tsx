"use client";

import { useQuery } from "@/hooks/use-query";
import { getMyRole } from "@/services/admin-order-service";
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
  const role = useQuery(
    user ? `header-role:${user.id}` : "header-role:anonymous",
    () => user ? getMyRole(user.id) : Promise.resolve(null),
  );
  const canSeeFarm = !loading && !!user && role.status === "success" && role.data === "admin";
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
          {canSeeFarm && <Link href="/farm/" className="rounded-lg px-3.5 py-2 text-slate-700 transition hover:bg-slate-100">Nông trại</Link>}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3.5 py-2 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden">
              Tiện ích
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 transition-transform group-open:rotate-180"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <Link href="/utilities/qr/" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-xs font-semibold">QR</span>
                <span>Tạo mã QR</span>
              </Link>
              <Link href="/utilities/prompts/" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-xs font-semibold">Aa</span>
                <span>Thư viện prompt</span>
              </Link>
              <Link href="/utilities/video-to-gif/" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[10px] font-semibold">GIF</span>
                <span>Video thành GIF</span>
              </Link>
            </div>
          </details>
          <Link href="/incense/" className="rounded-lg px-3.5 py-2 font-semibold text-amber-700 transition hover:bg-amber-50">Bỏ phiếu</Link>
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
