import type { Metadata } from "next";
import { PromptUtility } from "@/components/prompt-utility";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Thư viện prompt" };

export default function PromptPage() {
  return (
    <ToolShell
      title="Thư viện prompt"
    >
      <PromptUtility />
    </ToolShell>
  );
}
