import type { Metadata } from "next";
import { VideoToGifUtility } from "@/components/video-to-gif-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Chuyển video thành GIF" };

export default function VideoToGifPage() {
  return (
    <ToolShell
      title="Chuyển video thành GIF"
      description="Tải video, kéo chọn đoạn cần cắt, xem thử rồi tạo GIF vuông dưới 1 MB. Video được xử lý ngay trên thiết bị của bạn."
    >
      <VideoToGifUtility />
    </ToolShell>
  );
}
