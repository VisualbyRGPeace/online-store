import type { Metadata } from "next";
import { IncenseMessagesAdmin } from "@/components/admin/incense-messages-admin";

export const metadata: Metadata = { title: "Lời nguyện thắp nhang" };

export default function Page() {
  return <IncenseMessagesAdmin />;
}
