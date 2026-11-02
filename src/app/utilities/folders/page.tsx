import type { Metadata } from "next";
import { FolderManager } from "@/components/folder-manager";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Quản lý thư mục" };

export default function FoldersPage() {
  return (
    <ToolShell title="Quản lý thư mục">
      <FolderManager />
    </ToolShell>
  );
}
