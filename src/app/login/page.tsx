import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-64 max-w-md animate-pulse rounded-3xl bg-slate-100" />}>
      <LoginForm />
    </Suspense>
  );
}
