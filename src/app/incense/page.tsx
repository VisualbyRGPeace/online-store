import type { Metadata } from "next";
import { IncenseView } from "@/components/incense-view";

export const metadata: Metadata = {
  title: "Thắp nhang",
  description: "Thắp một nén nhang, gửi lời nguyện lành và hồi hướng công đức.",
};

export default function Page() {
  return <IncenseView />;
}
