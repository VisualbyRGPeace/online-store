import type { Metadata } from "next";
import { VideoToGifUtility } from "@/components/video-to-gif-utility";

export const metadata: Metadata = { title: "Chuyển video thành GIF" };

export default function VideoToGifPage() {
  return <VideoToGifUtility />;
}
