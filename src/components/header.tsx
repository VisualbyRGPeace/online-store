"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Byline } from "@/components/byline";
import { ClipboardIcon, FilmIcon, FolderIcon, FrameIcon, PromptIcon, QrIcon } from "@/components/utilities/tool-icons";
import { SITE_NAME } from "@/lib/site-config";

const UTILITY_LINKS = [
  { href: "/utilities/qr/", label: "Tạo mã QR", Icon: QrIcon },
  { href: "/utilities/prompts/", label: "Thư viện prompt", Icon: PromptIcon },
  { href: "/utilities/video-to-gif/", label: "Video thành GIF", Icon: FilmIcon },
  { href: "/utilities/add-frame/", label: "Add frame", Icon: FrameIcon },
  { href: "/utilities/folders/", label: "Quản lý thư mục", Icon: FolderIcon },
  { href: "/utilities/jobs/", label: "Quản lý Job", Icon: ClipboardIcon },
];

export function LogoMark() {
  return (
    <Image src="/logo.svg" alt="" width={32} height={32} priority className="h-8 w-8 rounded-lg" />
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
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3.5 py-2 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden">
              Tiện ích
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 transition-transform group-open:rotate-180"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              {UTILITY_LINKS.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </details>
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
