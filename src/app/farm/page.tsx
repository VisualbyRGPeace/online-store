import type { Metadata } from "next";
import { FarmGame } from "@/components/farm-game";

export const metadata: Metadata = {
  title: "Nông trại",
  description: "Trồng cây, thu hoạch và ghé thăm nông trại cộng đồng.",
};

export default function FarmPage() {
  return <FarmGame />;
}
