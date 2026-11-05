import type { Metadata } from "next";
import { JobManager } from "@/components/job-manager";
import { ToolShell } from "@/components/utilities/tool-shell";

export const metadata: Metadata = { title: "Quản lý Job" };

export default function JobsPage() {
  return (
    <ToolShell title="Quản lý Job" width="max-w-4xl">
      <JobManager />
    </ToolShell>
  );
}
