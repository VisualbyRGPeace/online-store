import type { Metadata } from "next";
import { IncenseAdmin } from "@/components/admin/incense-admin";

export const metadata: Metadata = { title: "Lịch sử bỏ phiếu" };

export default function Page() {
  return <IncenseAdmin />;
}
