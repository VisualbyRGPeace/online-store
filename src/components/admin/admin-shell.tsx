"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { useQuery } from "@/hooks/use-query";
import { getMyRole } from "@/services/admin-order-service";
import { EmptyState, ErrorState } from "@/components/ui/states";

const links = [
  ["/admin/", "Tổng quan"],
  ["/admin/products/", "Tài nguyên"],
  ["/admin/categories/", "Danh mục"],
  ["/admin/customers/", "Thành viên"],
] as const;
// Orders (/admin/orders/) and settings (/admin/settings/) still exist for when paid sales are switched on.

/** UI guard only. The database (RLS + is_admin()) is what actually protects admin data. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return <AuthGate>{(userId) => <RoleGate userId={userId}>{children}</RoleGate>}</AuthGate>;
}

function RoleGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const role = useQuery(`role:${userId}`, () => getMyRole(userId));

  if (role.status === "loading") return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (role.status === "error") return <ErrorState />;
  if (role.data !== "admin") {
    return <EmptyState title="Bạn không có quyền truy cập" description="Khu vực này chỉ dành cho quản trị viên." href="/" actionLabel="Về trang chủ" />;
  }

  return (
    <div className="grid gap-8 md:grid-cols-[180px_1fr]">
      <nav className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Quản trị">
        {links.map(([href, label]) => {
          const active = href === "/admin/" ? pathname === "/admin/" || pathname === "/admin" : pathname.startsWith(href.slice(0, -1));
          return (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${active ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
