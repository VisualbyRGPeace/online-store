import type { Metadata } from "next";
import { MemeUtility } from "@/components/meme-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Bách Khoa meme" };

export default function MemePage() {
  return (
    <ToolShell title="Bách Khoa meme">
      <MemeUtility />
    </ToolShell>
  );
}
