"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { currentAppPath } from "@/lib/next-param";
import { fieldErrors, formValues, loginSchema } from "@/lib/validation";
import { signIn } from "@/services/auth-service";
import { Field, FormMessage, primaryButton } from "@/components/ui/form";

/**
 * Sign-in pop-up shown when a signed-out visitor presses "Tải xuống".
 * After a successful sign-in, `onSuccess` runs (the download starts by itself).
 * Rendered in a portal so card hover effects cannot move or clip it.
 */
export function LoginDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setMessage(null);
    setBusy(true);
    const result = await signIn(parsed.data.identifier, parsed.data.password);
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    onSuccess();
  }

  const next = encodeURIComponent(currentAppPath());

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="login-dialog-title" className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-black">
          ×
        </button>
        <h2 id="login-dialog-title" className="text-xl font-semibold tracking-tight">Đăng nhập để tải</h2>
        <p className="mt-1 text-sm text-slate-500">Đăng nhập xong, tệp sẽ tự động tải về.</p>

        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          {message && <FormMessage kind="error">{message}</FormMessage>}
          <Field label="Tên đăng nhập hoặc email" name="identifier" autoComplete="username" autoFocus error={errors.identifier} />
          <Field label="Mật khẩu" name="password" type="password" autoComplete="current-password" error={errors.password} />
          <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
            {busy ? "Đang đăng nhập..." : "Đăng nhập và tải"}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-600">
          Chưa có tài khoản?{" "}
          <Link href={`/register/?next=${next}`} className="font-medium text-black underline">Đăng ký</Link>
          {" · "}
          <Link href="/forgot-password/" className="font-medium text-black underline">Quên mật khẩu?</Link>
        </p>
      </div>
    </div>,
    document.body,
  );
}
