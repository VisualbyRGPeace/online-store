import { createClient } from "@/lib/supabase/client";
import { absoluteUrl } from "@/lib/site";

export type Result = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; message: string };

const GENERIC = "Có lỗi xảy ra, vui lòng thử lại sau.";

export async function signUp(fullName: string, email: string, password: string): Promise<Result> {
  const { data, error } = await createClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: absoluteUrl("/login/") },
  });
  if (error) {
    console.error(error);
    return { ok: false, message: error.code === "weak_password" ? "Mật khẩu quá yếu, hãy chọn mật khẩu khác." : GENERIC };
  }
  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<Result> {
  const { error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) {
    console.error(error);
    if (error.code === "email_not_confirmed") return { ok: false, message: "Bạn chưa xác nhận email. Hãy kiểm tra hộp thư." };
    // Same message for wrong email / wrong password: do not reveal which accounts exist.
    return { ok: false, message: error.status === 400 ? "Email hoặc mật khẩu không đúng." : GENERIC };
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
