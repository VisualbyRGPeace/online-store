"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side auth state, used for UI only (showing links, redirecting to /login).
 * Real access control is enforced by RLS in the database, never by this hook.
 */
export function useAuth() {
  const [state, setState] = useState<{ loading: boolean; user: User | null }>({ loading: true, user: null });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setState({ loading: false, user: data.session?.user ?? null }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState({ loading: false, user: session?.user ?? null }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}
