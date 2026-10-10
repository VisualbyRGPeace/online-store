"use client";

import { useContext } from "react";
import { AuthContext } from "@/components/auth-provider";

/** { loading, user } from the shared AuthProvider (mounted in the root layout). */
export function useAuth() {
  return useContext(AuthContext);
}
