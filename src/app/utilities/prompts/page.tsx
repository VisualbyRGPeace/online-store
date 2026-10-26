import type { Metadata } from "next";
import { PromptUtility } from "@/components/prompt-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Thư viện prompt" };

export default function PromptPage() {
  return (
    <ToolShell
      title="Thư viện prompt"
      description="Chọn một prompt, điền các biến cần thay rồi sao chép dùng ngay. Bạn cũng có thể đăng prompt của mình."
    >
      <PromptUtility />
    </ToolShell>
  );
}
