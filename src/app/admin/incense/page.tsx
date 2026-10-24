import type { Metadata } from "next";
import { IncenseAdmin } from "@/components/admin/incense-admin";

export const metadata: Metadata = { title: "Lịch sử cúng dường" };

export default function Page() {
  return <IncenseAdmin />;
}
