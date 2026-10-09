import type { Metadata } from "next";
import { CustomersAdmin } from "@/components/admin/customers-admin";

export const metadata: Metadata = { title: "Khách hàng" };

export default function Page() {
  return <CustomersAdmin />;
}
