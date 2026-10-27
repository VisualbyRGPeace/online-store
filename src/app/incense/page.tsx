import type { Metadata } from "next";
import { IncenseView } from "@/components/incense-view";

export const metadata: Metadata = {
  title: "Cúng dường",
  description: "Gửi lời nguyện lành.",
};

export default function Page() {
  return <IncenseView />;
}
