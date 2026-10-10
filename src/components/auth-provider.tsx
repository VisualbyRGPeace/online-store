"use client";

import { createContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type AuthState = { loading: boolean; user: User | null };

export const AuthContext = createContext<AuthState>({ loading: true, user: null });

/** Reads the signed-in user once for the whole site. UI only: the database enforces real access. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setState({ loading: false, user: data.session?.user ?? null }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState({ loading: false, user: session?.user ?? null }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
