import type { Metadata } from "next";
import { VideoToGifUtility } from "@/components/video-to-gif-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Chuyển video thành GIF" };

export default function VideoToGifPage() {
  return (
    <ToolShell
      title="Chuyển video thành GIF"
    >
      <VideoToGifUtility />
    </ToolShell>
  );
}
