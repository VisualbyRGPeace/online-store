"use client";

import { createContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type AuthState = { loading: boolean; user: User | null; banned: boolean };

export const AuthContext = createContext<AuthState>({ loading: true, user: null, banned: false });

/**
 * Reads the signed-in user once for the whole site. A blocked (kicked / banned) member is signed out
 * right away and sees a notice. UI only: the database itself refuses downloads for blocked members.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, banned: false });
  const bannedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function resolve(user: User | null) {
      if (!user) {
        if (!cancelled) setState({ loading: false, user: null, banned: bannedRef.current });
        return;
      }
      const { data } = await supabase.from("profiles").select("banned_until").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      const until = (data as { banned_until: string | null } | null)?.banned_until;
      if (until && new Date(until).getTime() > Date.now()) {
        bannedRef.current = true;
        setState({ loading: false, user: null, banned: true });
        await supabase.auth.signOut();
        return;
      }
      bannedRef.current = false;
      setState({ loading: false, user, banned: false });
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // deferred on purpose: calling Supabase inside this callback can deadlock
      setTimeout(() => void resolve(session?.user ?? null), 0);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {state.banned && (
        <div role="alert" className="bg-black px-4 py-2 text-center text-sm text-white">
          Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}
