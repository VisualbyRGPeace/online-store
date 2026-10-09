import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function Page() {
  return <ForgotPasswordForm />;
}
