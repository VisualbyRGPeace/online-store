import type { Metadata } from "next";
import { QrUtility } from "@/components/qr-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Tạo mã QR" };

export default function QrPage() {
  return (
    <ToolShell
      title="Tạo mã QR"
      width="max-w-5xl"
    >
      <QrUtility />
    </ToolShell>
  );
}
