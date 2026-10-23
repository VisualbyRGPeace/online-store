import { createClient } from "@/lib/supabase/client";
import { absoluteUrl } from "@/lib/site";

export type Result = { ok: true } | { ok: false; message: string };

const GENERIC = "Có lỗi xảy ra, vui lòng thử lại sau.";
const USERNAME_EMAIL_DOMAIN = "accounts.online-store.invalid";

function authEmail(identifier: string): string {
  const value = identifier.trim();
  return value.includes("@") ? value.toLowerCase() : `${value.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
}

export async function signUp(username: string, password: string): Promise<Result> {
  const normalized = username.trim().toLowerCase();
  const { data, error } = await createClient().auth.signUp({
    email: authEmail(normalized),
    password,
    options: { data: { full_name: username.trim(), username: normalized } },
  });
  if (error) {
    console.error(error);
    if (error.code === "weak_password") return { ok: false, message: "Mật khẩu quá yếu, hãy chọn mật khẩu khác." };
    if (error.code === "user_already_exists" || error.code === "email_exists") return { ok: false, message: "Tên đăng nhập này đã được sử dụng." };
    return { ok: false, message: GENERIC };
  }
  if (!data.session) {
    return {
      ok: false,
      message: "Để đăng ký bằng tên đăng nhập, quản trị viên cần tắt xác nhận email trong Supabase Auth trước.",
    };
  }
  return { ok: true };
}

export async function signIn(identifier: string, password: string): Promise<Result> {
  const { error } = await createClient().auth.signInWithPassword({ email: authEmail(identifier), password });
  if (error) {
    console.error(error);
    if (error.code === "email_not_confirmed") return { ok: false, message: "Tài khoản chưa được xác nhận. Hãy liên hệ quản trị viên." };
    return { ok: false, message: error.status === 400 ? "Tên đăng nhập hoặc mật khẩu không đúng." : GENERIC };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const { error } = await createClient().auth.signOut();
  if (error) console.error(error);
}

export async function requestPasswordReset(email: string): Promise<Result> {
  const { error } = await createClient().auth.resetPasswordForEmail(email, {
    redirectTo: absoluteUrl("/reset-password/"),
  });
  if (error) console.error(error); // still report success to the user: no account enumeration
  return { ok: true };
}

export async function updatePassword(password: string): Promise<Result> {
  const { error } = await createClient().auth.updateUser({ password });
  if (error) {
    console.error(error);
    return { ok: false, message: error.code === "same_password" ? "Mật khẩu mới phải khác mật khẩu cũ." : GENERIC };
  }
  return { ok: true };
}
