import type { Metadata } from "next";
import { IncenseView } from "@/components/incense-view";

export const metadata: Metadata = {
  title: "Cúng dường",
  description: "Cúng dường một nén nhang, gửi lời nguyện lành.",
};

export default function Page() {
  return <IncenseView />;
}
