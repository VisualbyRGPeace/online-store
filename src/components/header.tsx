"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";

export function Header() {
  const { count } = useCart();
  const { user, loading } = useAuth();
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          Shop
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/products/" className="hover:underline">
            Sản phẩm
          </Link>
          {!loading && (
            <Link href={user ? "/account/" : "/login/"} className="hover:underline">
              {user ? "Tài khoản" : "Đăng nhập"}
            </Link>
          )}
          <Link href="/cart/" className="flex items-center gap-1.5 hover:underline">
            Giỏ hàng
            {count > 0 && (
              <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-xs leading-none text-white">{count}</span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-200 py-8 text-center text-sm text-neutral-500">
      © {new Date().getFullYear()} Shop
    </footer>
  );
}
