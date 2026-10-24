import type { Metadata } from "next";
import { IncenseMessagesAdmin } from "@/components/admin/incense-messages-admin";

export const metadata: Metadata = { title: "Thông điệp cúng dường" };

export default function Page() {
  return <IncenseMessagesAdmin />;
}
