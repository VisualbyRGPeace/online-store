"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

/** Sends visitors who are not signed in to /login. UI convenience only; RLS is the real guard. */
export function AuthGate({ children }: { children: (userId: string, email: string) => React.ReactNode }) {
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login/");
  }, [loading, user, router]);

  if (loading || !user) return <div className="h-40 animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  return <>{children(user.id, user.email ?? "")}</>;
}
