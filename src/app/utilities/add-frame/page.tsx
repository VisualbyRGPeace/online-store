import type { Metadata } from "next";
import { AddFrameUtility } from "@/components/add-frame-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Add frame" };

export default function AddFramePage() {
  return (
    <ToolShell title="Add frame">
      <AddFrameUtility />
    </ToolShell>
  );
}
