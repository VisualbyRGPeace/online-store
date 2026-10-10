"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { fieldErrors, forgotSchema, formValues, loginSchema, registerSchema, resetSchema } from "@/lib/validation";
import { requestPasswordReset, signIn, signUp, updatePassword } from "@/services/auth-service";
import { AuthCard, Field, FormMessage, primaryButton } from "@/components/ui/form";

type Errors = Record<string, string>;
const linkClass = "font-medium text-brand-600 hover:text-brand-700 hover:underline";

export function LoginForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setMessage(null);
    setBusy(true);
    const result = await signIn(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    router.push("/account/");
  }

  return (
    <AuthCard title="Đăng nhập">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {message && <FormMessage kind="error">{message}</FormMessage>}
        <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
        <Field label="Mật khẩu" name="password" type="password" autoComplete="current-password" error={errors.password} />
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        <Link href="/forgot-password/" className={linkClass}>Quên mật khẩu?</Link>
        {" · "}
        <Link href="/register/" className={linkClass}>Tạo tài khoản</Link>
      </p>
    </AuthCard>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setMessage(null);
    setBusy(true);
    const result = await signUp(parsed.data.full_name, parsed.data.email, parsed.data.password);
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    if (result.needsEmailConfirmation) return setSent(true);
    router.push("/account/");
  }

  if (sent) {
    return (
      <AuthCard title="Kiểm tra email của bạn">
        <FormMessage kind="success">
          Nếu email hợp lệ, chúng tôi đã gửi liên kết xác nhận. Hãy mở email và bấm vào liên kết để hoàn tất đăng ký.
        </FormMessage>
        <p className="mt-4 text-sm"><Link href="/login/" className={linkClass}>Về trang đăng nhập</Link></p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Tạo tài khoản">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {message && <FormMessage kind="error">{message}</FormMessage>}
        <Field label="Họ và tên" name="full_name" autoComplete="name" maxLength={100} error={errors.full_name} />
        <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
        <Field label="Mật khẩu (tối thiểu 8 ký tự)" name="password" type="password" autoComplete="new-password" error={errors.password} />
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          {busy ? "Đang tạo tài khoản..." : "Đăng ký"}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        Đã có tài khoản? <Link href="/login/" className={linkClass}>Đăng nhập</Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = forgotSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    await requestPasswordReset(parsed.data.email);
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthCard title="Quên mật khẩu">
      {sent ? (
        <FormMessage kind="success">Nếu email tồn tại trong hệ thống, bạn sẽ nhận được liên kết đặt lại mật khẩu.</FormMessage>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
          <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
            {busy ? "Đang gửi..." : "Gửi liên kết đặt lại"}
          </button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link href="/login/" className={linkClass}>Về trang đăng nhập</Link></p>
    </AuthCard>
  );
}

export function ResetPasswordForm() {
  const { loading, user } = useAuth();
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = resetSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setMessage(null);
    setBusy(true);
    const result = await updatePassword(parsed.data.password);
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    router.push("/account/");
  }

  if (loading) return <div className="mx-auto h-40 max-w-sm animate-pulse rounded-lg bg-neutral-200" aria-busy="true" />;
  if (!user) {
    return (
      <AuthCard title="Đặt lại mật khẩu">
        <FormMessage kind="error">Liên kết không hợp lệ hoặc đã hết hạn.</FormMessage>
        <p className="mt-4 text-sm"><Link href="/forgot-password/" className={linkClass}>Yêu cầu liên kết mới</Link></p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Đặt mật khẩu mới">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {message && <FormMessage kind="error">{message}</FormMessage>}
        <Field label="Mật khẩu mới (tối thiểu 8 ký tự)" name="password" type="password" autoComplete="new-password" error={errors.password} />
        <Field label="Nhập lại mật khẩu" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          {busy ? "Đang lưu..." : "Lưu mật khẩu"}
        </button>
      </form>
    </AuthCard>
  );
}
