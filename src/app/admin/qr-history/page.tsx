import type { Metadata } from "next";
import { QrHistoryAdmin } from "@/components/admin/qr-history-admin";

export const metadata: Metadata = { title: "Lịch sử mã QR" };

export default function Page() {
  return <QrHistoryAdmin />;
}
