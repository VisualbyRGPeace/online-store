import type { Metadata } from "next";
import { IncenseAdmin } from "@/components/admin/incense-admin";

export const metadata: Metadata = { title: "Quản lý nhang" };

export default function Page() {
  return <IncenseAdmin />;
}
