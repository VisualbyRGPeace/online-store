import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Đăng ký" };

export default function Page() {
  return <RegisterForm />;
}
