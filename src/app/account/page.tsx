import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";

export const metadata: Metadata = { title: "Tài khoản" };

export default function Page() {
  return <AccountView />;
}
