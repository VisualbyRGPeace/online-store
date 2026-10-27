import type { Metadata } from "next";
import { DonationsAdmin } from "@/components/admin/donations-admin";

export const metadata: Metadata = { title: "Thanh toán" };

export default function Page() {
  return <DonationsAdmin />;
}
