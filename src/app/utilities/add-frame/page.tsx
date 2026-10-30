import type { Metadata } from "next";
import { AddFrameUtility } from "@/components/add-frame-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Add frame" };

export default function AddFramePage() {
  return (
    <ToolShell
      title="Add frame"
      description="Tải một ảnh lên, chọn danh mục: frame và logo được thêm tự động. Xuất ảnh 3000 × 3000 px dạng JPG hoặc PNG."
    >
      <AddFrameUtility />
    </ToolShell>
  );
}
