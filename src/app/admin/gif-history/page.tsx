import type { Metadata } from "next";
import { GifHistoryAdmin } from "@/components/admin/gif-history-admin";

export const metadata: Metadata = { title: "Lịch sử GIF" };

export default function Page() {
  return <GifHistoryAdmin />;
}
