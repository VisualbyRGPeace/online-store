import type { Metadata } from "next";
import { DonationsAdmin } from "@/components/admin/donations-admin";

export const metadata: Metadata = { title: "Cúng dường" };

export default function Page() {
  return <DonationsAdmin />;
}
