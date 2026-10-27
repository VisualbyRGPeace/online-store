import type { Metadata } from "next";
import { IncenseView } from "@/components/incense-view";

export const metadata: Metadata = {
  title: "Ai sẽ là tổng thống tiếp theo của nước Mỹ nào?",
  description: "Gửi lá phiếu của bạn vào hòm bỏ phiếu.",
};

export default function Page() {
  return <IncenseView />;
}
