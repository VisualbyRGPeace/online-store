"use client";

import { useEffect, useState } from "react";

type Result<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: T };

/**
 * Tiny data-fetching hook. `key` must change whenever the inputs of `fn` change.
 * Errors are logged to the console and surfaced to the UI as a generic state only.
 */
export function useQuery<T>(key: string, fn: () => Promise<T>): Result<T> {
  const [state, setState] = useState<{ key: string; data?: T; failed?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fn()
      .then((data) => {
        if (!cancelled) setState({ key, data });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setState({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!state || state.key !== key) return { status: "loading" };
  if (state.failed) return { status: "error" };
  return { status: "success", data: state.data as T };
}
