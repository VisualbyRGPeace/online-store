import type { Metadata } from "next";
import { QrUtility } from "@/components/qr-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Tạo mã QR" };

export default function QrPage() {
  return (
    <ToolShell
      title="Tạo mã QR"
      description="Nhập nội dung, mã QR cập nhật ngay. Tải về dạng SVG sắc nét hoặc PNG để chèn vào tài liệu."
      width="max-w-5xl"
    >
      <QrUtility />
    </ToolShell>
  );
}
